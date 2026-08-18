// appeal.spec.ts — `appeal` + `finalize_dispute` + `claim_appeal_refund` e2e,
// ADR-0012 accumulator + per-seat draw_seat flow.
//
// Builds a complete first round (subaccord → stake jurors w/ accumulator paths →
// create_dispute → injectCommittedVrf (freezes root) → draw_seat × N → commit →
// reveal → finalize_round), then `appeal()` opens round 1 at 2N+1, which the
// per-seat `draw_seat` fills one tx at a time (the OLD one-shot `draw` could not
// fit a panel-7 instruction in a 1232 B packet; ADR-0012 removed that ceiling).
// Then finalize_dispute + bond routing (forfeit on no-flip → coherent pool;
// return on flip via claim_appeal_refund).
//
// Ladder: round-1 panel = 3 (fixed); the first appeal grows it to 7. The
// appeal economics (bond custody, flip→refund, no-flip→forfeit + coherent-pool
// split) are unchanged by ADR-0012 — they live in finalize_dispute.
//
// Serial (global time-warp + AccordState singleton). Multi-signer: per-juror
// Accord facades (stake/commit/reveal need the juror keypair); permissionless
// cranks + appellant reuse env.payer.
import {
  Accord,
  appeal,
  appealCost,
  claimAppealRefund,
  commit,
  createDispute,
  createSubaccord,
  drawSeat,
  finalizeDispute,
  finalizeRound,
  initializePause,
  panelSizeForRound,
  reveal,
  requiredFee,
  resolveSeat,
  stake,
  buildAccumulator,
  proofFor,
  findAppealBondPda,
  findJurorStakePda,
  findAccordStatePda,
  findRoundPda,
  getAppealBondDecoder,
  getDisputeDecoder,
  getJurorStakeDecoder,
  getRoundDecoder,
  DEFAULT_APPEAL_WINDOW_SECS,
  type MerkleAccumulator,
  type SeatMembership,
} from "@useaccord/sdk";
import {
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";

import { readClock, warpForwardSeconds } from "./setup/cheats.js";
import { fetchDecoded } from "./setup/assertions.js";
import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import { defaultSubaccordArgs, randomBytes32 } from "./setup/fixtures.js";
import {
  createMint,
  setTokenBalance,
  TOKEN_PROGRAM_ID,
} from "./setup/tokens.js";
import { injectCommittedVrf } from "./setup/vrf.js";

// --- economics mirroring appeal_litesvm.rs -----------------------------------
const FEE_PER_JUROR = 1_000_000n;
// Round-1 panel is the fixed INITIAL_NUM_JURORS (=3); the first appeal grows it
// to 7. draw_seat is per-seat, so a panel-7 round-1 draw is seven txs.
const STAKE_AMOUNT = 5_000n;
const N_JURORS = 8; // ≥ round-1 appeal panel 7, with a margin; tree depth 4 (16 leaves)
const DEPTH = 4;
const COMMITTED_VRF = new Uint8Array(32).fill(42);

// DisputeState numeric tags (state.rs — ADR-0012 dropped SnapshotPosted, so
// the tags shifted: Created=0, Drawn=1, …, RoundResolved=5, Final=6).
const STATE_CREATED = 0;
const STATE_ROUND_RESOLVED = 5;
const STATE_FINAL = 6;

const ASSOC_TOKEN_PROGRAM =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;
const ADDR_ENC = getAddressEncoder();
const ADDR_DEC = getAddressDecoder();

// --- raw account helpers -----------------------------------------------------
async function rawAccount(
  env: TestEnv,
  addr: Address,
): Promise<Uint8Array | null> {
  const r = await env.rpc.getAccountInfo(addr, { encoding: "base64" }).send();
  if (!r.value) return null;
  return new Uint8Array(Buffer.from(r.value.data[0]!, "base64"));
}

async function readDispute(env: TestEnv, addr: Address) {
  const d = await fetchDecoded(env, addr, getDisputeDecoder());
  if (!d) throw new Error(`dispute account missing: ${addr}`);
  return d;
}

async function readRound(env: TestEnv, addr: Address) {
  const d = await fetchDecoded(env, addr, getRoundDecoder());
  if (!d) throw new Error(`round account missing: ${addr}`);
  return d;
}

async function readAppealBond(env: TestEnv, addr: Address) {
  const d = await fetchDecoded(env, addr, getAppealBondDecoder());
  if (!d) throw new Error(`appeal bond account missing: ${addr}`);
  return d;
}

async function readJurorAmount(env: TestEnv, pda: Address): Promise<bigint> {
  const d = await fetchDecoded(env, pda, getJurorStakeDecoder());
  if (!d) throw new Error(`juror_stake missing: ${pda}`);
  return d.staked;
}

async function readJurorSettlementDelta(
  env: TestEnv,
  pda: Address,
): Promise<bigint> {
  const d = await fetchDecoded(env, pda, getJurorStakeDecoder());
  if (!d) throw new Error(`juror_stake missing: ${pda}`);
  return d.stakeDelta;
}

async function readJurorFeesEarned(
  env: TestEnv,
  pda: Address,
): Promise<bigint> {
  const d = await fetchDecoded(env, pda, getJurorStakeDecoder());
  if (!d) throw new Error(`juror_stake missing: ${pda}`);
  return d.feesEarned;
}

async function tokenAmount(env: TestEnv, ata: Address): Promise<bigint> {
  const res = await env.rpc.getTokenAccountBalance(ata).send();
  return BigInt(res.value.amount);
}

// --- byte/address helpers ----------------------------------------------------
function addrBytes(a: Address): Uint8Array {
  return new Uint8Array(ADDR_ENC.encode(a));
}
function toAddr(b: Uint8Array): Address {
  return ADDR_DEC.decode(b) as Address;
}
function toHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

async function ataOf(mint: Address, owner: Address): Promise<Address> {
  const [addr] = await getProgramDerivedAddress({
    programAddress: ASSOC_TOKEN_PROGRAM,
    seeds: [
      ADDR_ENC.encode(owner),
      ADDR_ENC.encode(TOKEN_PROGRAM_ID),
      ADDR_ENC.encode(mint),
    ],
  });
  return addr;
}

function roleAccord(env: TestEnv, signer: KeyPairSigner): Accord {
  return new Accord({ endpoint: env.rpcUrl, signer });
}

/** Warp the global Clock forward to an absolute unix timestamp (no-op if past). */
async function warpTo(env: TestEnv, targetTs: bigint): Promise<void> {
  const now = await readClock(env);
  const delta = targetTs - now.unixTimestamp;
  if (delta > 0n) await warpForwardSeconds(env, delta);
}

interface Juror {
  signer: KeyPairSigner;
  accord: Accord;
  jurorStake: Address;
  /** Staking-token ATA — reveal pays the participation fee here. */
  jurorAta: Address;
}

interface World {
  env: TestEnv;
  mint: Address;
  subaccord: Address;
  accordState: Address;
  vault: Address;
  payerAta: Address;
  dispute: Address;
  disputeBytes: Uint8Array;
  jurors: Juror[];
  tree: MerkleAccumulator;
  jurorStakeByHex: Map<string, Address>;
  jurorByAddr: Map<string, Juror>;
}

/**
 * Resolve a full round against the FROZEN accumulator (VRF + root frozen once at
 * dispute creation; every round's draw_seat selects against it). Draws the panel
 * one seat per draw_seat tx, then commit → reveal → finalize_round, with each
 * drawn juror casting `votes[i]`. Returns the round PDA + the drawn juror stake
 * PDAs (in round.jurors order).
 */
async function resolveRound(
  w: World,
  roundIdx: number,
  votes: bigint[],
): Promise<{ roundPda: Address; jurorStakes: Address[] }> {
  const {
    env,
    subaccord,
    dispute,
    disputeBytes,
    tree,
    jurorStakeByHex,
    jurorByAddr,
  } = w;
  const panel = panelSizeForRound(roundIdx);
  if (panel === null)
    throw new Error(`panelSizeForRound null for round ${roundIdx}`);
  if (votes.length !== panel)
    throw new Error(`votes length ${votes.length} != panel ${panel}`);

  const [roundPda] = await findRoundPda({ dispute, roundIdx });

  // --- draw_seat × panel (deterministic collision re-roll, distinct jurors) ---
  const drawn: Juror[] = [];
  const jurorStakes: Address[] = [];
  const drawnJurorBytes: Uint8Array[] = [];
  for (let seat = 0; seat < panel; seat++) {
    const resolved = await resolveSeat(
      COMMITTED_VRF,
      disputeBytes,
      roundIdx,
      seat,
      tree,
      drawnJurorBytes,
    );
    const pda = jurorStakeByHex.get(toHex(resolved.leaf.juror));
    if (!pda)
      throw new Error(`no JurorStake for juror ${toHex(resolved.leaf.juror)}`);
    const membership: SeatMembership = {
      leaf: resolved.leaf,
      index: resolved.index,
      proof: resolved.proof,
      jurorStake: pda,
      retries: resolved.retries,
    };
    await env.sendIx(
      drawSeat(
        env.accord.adapter,
        env.programId,
        { caller: env.payer.address, subaccord, dispute },
        roundPda,
        seat,
        membership,
      ),
    );
    const j = jurorByAddr.get(toAddr(resolved.leaf.juror));
    if (!j) throw new Error(`drawn juror not in staked set`);
    drawn.push(j);
    jurorStakes.push(pda);
    drawnJurorBytes.push(resolved.leaf.juror);
  }

  // --- commit (window opens at review_end) ---
  let round = await readRound(env, roundPda);
  await warpTo(env, round.reviewEnd);
  const salts = drawn.map((_, i) => {
    const s = new Uint8Array(32);
    s.fill(10 + i);
    return s;
  });
  for (let i = 0; i < panel; i++) {
    const { instruction } = await commit(
      drawn[i]!.accord.adapter,
      env.programId,
      { signer: drawn[i]!.signer.address, subaccord, dispute, round: roundPda },
      { vote: votes[i]!, salt: salts[i]! },
    );
    await env.sendIx(instruction);
  }

  // --- reveal (window opens at commit_end) ---
  round = await readRound(env, roundPda);
  await warpTo(env, round.commitEnd);
  for (let i = 0; i < panel; i++) {
    await env.sendIx(
      reveal(
        drawn[i]!.accord.adapter,
        env.programId,
        {
          signer: drawn[i]!.signer.address,
          subaccord,
          dispute,
          round: roundPda,
          stakingToken: w.mint,
          jurorTokenAccount: drawn[i]!.jurorAta,
          vault: w.vault,
        },
        { vote: votes[i]!, salt: salts[i]! },
      ),
    );
  }

  // --- finalize_round (eligible after reveal_end) ---
  round = await readRound(env, roundPda);
  await warpTo(env, round.revealEnd);
  await env.sendIx(
    finalizeRound(
      env.accord.adapter,
      env.programId,
      {
        signer: env.payer.address,
        subaccord,
        dispute,
        round: roundPda,
      },
      jurorStakes,
    ),
  );

  return { roundPda, jurorStakes };
}

/**
 * Build a fresh world (pause → mint → subaccord → stake N_JURORS → createDispute
 * → injectCommittedVrf (freezes root) → resolve round 0 with the chosen winner).
 * Each call mints fresh PDAs ⇒ re-runnable. Returns round-0 artifacts.
 */
async function buildWorldResolved0(
  env: TestEnv,
  opts: { maxAppeals: number; round0Result: number },
): Promise<World & { round0: Address; round0JurorStakes: Address[] }> {
  // AccordState singleton — init once per surfnet session if absent.
  const [accordState] = await findAccordStatePda();
  if (!(await rawAccount(env, accordState))) {
    const { instruction } = await initializePause(
      env.accord.adapter,
      env.programId,
      env.payer.address,
    );
    await env.sendIx(instruction);
  }

  const { mint } = await createMint(env, 6);

  const args = defaultSubaccordArgs(mint, mint, env.payer.address, {
    feePerJuror: FEE_PER_JUROR,
    maxAppeals: opts.maxAppeals,
    depth: DEPTH,
  });
  const sub = await createSubaccord(
    env.accord.adapter,
    env.programId,
    env.payer.address,
    args,
  );
  await env.sendIx(sub.instruction);
  const subaccord = sub.subaccord;
  const vault = await ataOf(mint, subaccord);

  // Stake N_JURORS — each funds JurorStake + vault-ATA rent (init_if_needed).
  let tree = await buildAccumulator([], DEPTH);
  const leaves: { juror: Uint8Array; stake: bigint }[] = [];
  const jurors: Juror[] = [];
  const jurorStakeByHex = new Map<string, Address>();
  const jurorByAddr = new Map<string, Juror>();
  for (let i = 0; i < N_JURORS; i++) {
    const signer = await fundSigner(env);
    await setTokenBalance(env, signer.address, mint, STAKE_AMOUNT);
    const [jurorStake] = await findJurorStakePda({
      subaccord,
      juror: signer.address,
    });
    const accord = roleAccord(env, signer);
    const jurorAta = await ataOf(mint, signer.address);
    const path = await proofFor(tree, i);
    await env.sendIx(
      stake(
        accord.adapter,
        env.programId,
        {
          juror: signer.address,
          subaccord,
          accordState,
          jurorStake,
          stakingToken: mint,
          jurorTokenAccount: jurorAta,
          stakeVault: vault,
        },
        STAKE_AMOUNT,
        path,
      ),
    );
    leaves[i] = { juror: addrBytes(signer.address), stake: STAKE_AMOUNT };
    tree = await buildAccumulator(leaves, DEPTH);
    jurors.push({ signer, accord, jurorStake, jurorAta: jurorAta });
    jurorStakeByHex.set(toHex(addrBytes(signer.address)), jurorStake);
    jurorByAddr.set(signer.address, { signer, accord, jurorStake, jurorAta });
  }

  // Fund the payer ATA generously (filer fee + appeal cost).
  await setTokenBalance(env, env.payer.address, mint, 1_000_000_000_000n);
  const payerAta = await ataOf(mint, env.payer.address);

  const fee = requiredFee(FEE_PER_JUROR)!;
  const nonce = BigInt(1 + Math.floor(Math.random() * 1_000_000_000));
  const disp = await createDispute(
    env.accord.adapter,
    {
      filer: env.payer.address,
      rentPayer: env.payer.address,
      subaccord,
      feeToken: mint,
      filerTokenAccount: payerAta,
      feeVault: vault,
      accordState,
    },
    {
      options: [randomBytes32(), randomBytes32()],
      evidenceHash: randomBytes32(),
      nonce,
      fee,
    },
    env.programId,
  );
  await env.sendIx(disp.instruction);
  const dispute = disp.dispute;

  // Freeze the accumulator root atomically with the (mocked) VRF callback. Every
  // round's draw_seat selects against this one frozen root.
  await injectCommittedVrf(
    env,
    dispute,
    COMMITTED_VRF,
    tree.rootHash,
    tree.rootSum,
  );

  const world: World = {
    env,
    mint,
    subaccord,
    accordState,
    vault,
    payerAta,
    dispute,
    disputeBytes: addrBytes(dispute),
    jurors,
    tree,
    jurorStakeByHex,
    jurorByAddr,
  };

  // Round 0: panel 3 (fixed INITIAL_NUM_JURORS); majority (2 of 3) votes the
  // chosen winner, one dissent to keep a realistic coherent/incoherent split.
  const r0 = await resolveRound(world, 0, [
    BigInt(opts.round0Result),
    BigInt(opts.round0Result),
    BigInt(1 - opts.round0Result),
  ]);
  const d0 = await readDispute(env, dispute);
  expect(Number(d0.state)).toBe(STATE_ROUND_RESOLVED);
  expect(Number(d0.currentRound)).toBe(0);

  return { ...world, round0: r0.roundPda, round0JurorStakes: r0.jurorStakes };
}

/** Build the `appeal` accounts block for the prior round 0 appeal. */
function appealAccounts(w: World & { round0: Address }, appealBond: Address) {
  return {
    appellant: w.env.payer.address,
    subaccord: w.subaccord,
    accordState: w.accordState,
    dispute: w.dispute,
    round: w.round0,
    appealBond,
    feeToken: w.mint,
    appellantTokenAccount: w.payerAta,
    feeVault: w.vault,
  };
}

// --- tests -------------------------------------------------------------------
describe("e2e: appeal + finalize_dispute (requires Surfpool)", () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await createTestEnv();
  }, 60_000);

  it("appeal opens round 1 at 2N+1, finalizes, and refunds a flipped bond", async () => {
    if (!env.up) return;
    const w = await buildWorldResolved0(env, {
      maxAppeals: 1,
      round0Result: 0,
    });

    // --- appeal (prior round = 0 ⇒ AppealBond keyed by round_idx 0) ---
    const [appealBond] = await findAppealBondPda({
      dispute: w.dispute,
      roundIdx: 0,
    });
    const vaultBefore = await tokenAmount(env, w.vault);
    const appellantBefore = await tokenAmount(env, w.payerAta);

    await env.sendIx(
      appeal(
        env.accord.adapter,
        env.programId,
        appealAccounts(w, appealBond),
        new Uint8Array(32),
      ),
    );

    const d = await readDispute(env, w.dispute);
    expect(Number(d.currentRound)).toBe(1);
    expect(Number(d.state)).toBe(STATE_CREATED);

    // Appeal economics: appellant pays new-round fee + appeal bond (bond ==
    // new-round fee), both custodied appellant → vault. panel_new = 2N+1 = 7.
    const cost = appealCost(0, FEE_PER_JUROR)!;
    expect(cost.panel).toBe(7);
    expect(cost.total).toBe(14n * FEE_PER_JUROR);
    expect((await readAppealBond(env, appealBond)).amount).toBe(cost.total);
    expect(appellantBefore - (await tokenAmount(env, w.payerAta))).toBe(
      cost.total,
    );
    expect((await tokenAmount(env, w.vault)) - vaultBefore).toBe(cost.total);

    // --- resolve round 1 (flip: plurality 1 ≠ prior 0) ---
    const r1 = await resolveRound(w, 1, [1n, 1n, 1n, 1n, 0n, 0n, 0n]);
    const r1d = await readRound(env, r1.roundPda);
    expect(Number(r1d.roundIdx)).toBe(1);
    expect(Number(r1d.jurorCount)).toBe(7);
    expect(r1d.result).toBe(1n);

    // --- warp past the appeal window + finalize the dispute ---
    await warpTo(env, r1d.revealEnd + DEFAULT_APPEAL_WINDOW_SECS + 1n);
    await env.sendIx(
      finalizeDispute(
        env.accord.adapter,
        env.programId,
        {
          signer: env.payer.address,
          subaccord: w.subaccord,
          dispute: w.dispute,
          round: r1.roundPda,
        },
        [...r1.jurorStakes, appealBond],
      ),
    );

    const dFinal = await readDispute(env, w.dispute);
    expect(Number(dFinal.state)).toBe(STATE_FINAL);
    expect(dFinal.finalRuling).toBe(1n);
    // finalizedAt stamped at the Final transition (Betline reveal-window
    // anchor); 0 before Final, now > 0 and cannot precede filing.
    expect(dFinal.finalizedAt).toBeGreaterThan(0n);
    expect(dFinal.finalizedAt >= dFinal.filedAt).toBe(true);

    // Flipped bond survives finalization for claim_appeal_refund.
    expect((await readAppealBond(env, appealBond)).amount).toBe(cost.total);

    // --- claim refund: vault → appellant ATA (full bond) ---
    const beforeClaim = await tokenAmount(env, w.payerAta);
    await env.sendIx(
      claimAppealRefund(
        env.accord.adapter,
        env.programId,
        {
          caller: env.payer.address,
          subaccord: w.subaccord,
          dispute: w.dispute,
          appealBond,
          feeToken: w.mint,
          claimantTokenAccount: w.payerAta,
          feeVault: w.vault,
        },
        0,
      ),
    );
    expect((await tokenAmount(env, w.payerAta)) - beforeClaim).toBe(cost.bond);

    // Bond is zeroed on payout ⇒ second claim reverts.
    await expect(
      env.sendIx(
        claimAppealRefund(
          env.accord.adapter,
          env.programId,
          {
            caller: env.payer.address,
            subaccord: w.subaccord,
            dispute: w.dispute,
            appealBond,
            feeToken: w.mint,
            claimantTokenAccount: w.payerAta,
            feeVault: w.vault,
          },
          0,
        ),
      ),
    ).rejects.toThrow();
  }, 400_000);

  it("no-flip appeal forfeits the bond to the coherent pool", async () => {
    if (!env.up) return;
    const w = await buildWorldResolved0(env, {
      maxAppeals: 1,
      round0Result: 0,
    });

    const [appealBond] = await findAppealBondPda({
      dispute: w.dispute,
      roundIdx: 0,
    });
    await env.sendIx(
      appeal(
        env.accord.adapter,
        env.programId,
        appealAccounts(w, appealBond),
        new Uint8Array(32),
      ),
    );

    // Round 1 does NOT flip (result 0 == prior 0). votes [0,0,0,0,1,1,1]:
    // jurors 0-3 coherent (voted 0), jurors 4-6 incoherent (voted 1)
    // ⇒ slash (3 incoherent) + redistribution to the 4 coherent.
    const r1 = await resolveRound(w, 1, [0n, 0n, 0n, 0n, 1n, 1n, 1n]);
    const r1d = await readRound(env, r1.roundPda);
    expect(r1d.result).toBe(0n);
    const coherentPdas = r1.jurorStakes.slice(0, 4);
    const incoherentPdas = r1.jurorStakes.slice(4);
    const coherentDeltaBefore = await Promise.all(
      coherentPdas.map((p) => readJurorSettlementDelta(env, p)),
    );
    const coherentFeesBefore = await Promise.all(
      coherentPdas.map((p) => readJurorFeesEarned(env, p)),
    );
    const incoherentBefore = await Promise.all(
      incoherentPdas.map((p) => readJurorSettlementDelta(env, p)),
    );

    await warpTo(env, r1d.revealEnd + DEFAULT_APPEAL_WINDOW_SECS + 1n);
    await env.sendIx(
      finalizeDispute(
        env.accord.adapter,
        env.programId,
        {
          signer: env.payer.address,
          subaccord: w.subaccord,
          dispute: w.dispute,
          round: r1.roundPda,
        },
        [...r1.jurorStakes, appealBond],
      ),
    );

    const dFinal = await readDispute(env, w.dispute);
    expect(Number(dFinal.state)).toBe(STATE_FINAL);
    expect(dFinal.finalRuling).toBe(0n);

    // Coherence redistribution (ADR-0004 + ADR-0020 two-mint/two-vault split):
    // `finalize_dispute` settles the final round against the finalized ruling
    // via `settle_round_accounts`, which distributes TWO distinct pools — never
    // mixing mints, even when staking_token == fee_token:
    //
    // 1. STAKE pool (staking_token → stake_delta, folded into `staked` later
    //    by `reconcile_stake`; the stake_vault balance is invariant):
    //    the slash proceeds from incoherent jurors.
    // 2. FEE pool (fee_token → fees_earned, pulled by `withdraw_fees`; lives
    //    in fee_vault): non-revealer fees + the forfeited (no-flip) appeal bond.
    //
    // The forfeited bond was deposited into fee_vault at `appeal`, so it is
    // fee_token and MUST route to `fees_earned`, not `stake_delta`.
    //
    // All 7 revealed ⇒ non-revealer fee = 0.
    //   slash_total = 3·100 (three incoherent jurors; α·min_stake each) = 300
    //   forfeit     = bond portion = total − fee = 14·fee − 7·fee = 7·fee (= 7_000_000)
    //   stake_pool  = 300  ⇒ stake_share = 300 / 4        = 75
    //   fee_pool    = 0 + 7_000_000                       = 7_000_000
    //   fee_share   = 7_000_000 / 4                       = 1_750_000
    const SLASH_PER_JUROR = 100n;
    const STAKE_SHARE = (3n * SLASH_PER_JUROR) / 4n; // 75
    const FEE_SHARE = (7n * FEE_PER_JUROR) / 4n; // 1_750_000
    for (let i = 0; i < coherentPdas.length; i++) {
      expect(
        (await readJurorSettlementDelta(env, coherentPdas[i]!)) -
          coherentDeltaBefore[i]!,
      ).toBe(STAKE_SHARE);
      expect(
        (await readJurorFeesEarned(env, coherentPdas[i]!)) -
          coherentFeesBefore[i]!,
      ).toBe(FEE_SHARE);
    }
    for (let i = 0; i < incoherentPdas.length; i++) {
      expect(
        incoherentBefore[i]! -
          (await readJurorSettlementDelta(env, incoherentPdas[i]!)),
      ).toBe(SLASH_PER_JUROR);
    }

    // No-flip ⇒ finalize_dispute folds the bond into the coherent pool (zeroed).
    expect((await readAppealBond(env, appealBond)).amount).toBe(0n);

    // claim_appeal_refund reverts (bond already forfeited) + no balance change.
    const beforeClaim = await tokenAmount(env, w.payerAta);
    await expect(
      env.sendIx(
        claimAppealRefund(
          env.accord.adapter,
          env.programId,
          {
            caller: env.payer.address,
            subaccord: w.subaccord,
            dispute: w.dispute,
            appealBond,
            feeToken: w.mint,
            claimantTokenAccount: w.payerAta,
            feeVault: w.vault,
          },
          0,
        ),
      ),
    ).rejects.toThrow();
    expect(await tokenAmount(env, w.payerAta)).toBe(beforeClaim);
  }, 400_000);

  it("appeal past the appeal window reverts", async () => {
    if (!env.up) return;
    const w = await buildWorldResolved0(env, {
      maxAppeals: 1,
      round0Result: 0,
    });
    // Warp past reveal_end + APPEAL_WINDOW ⇒ AppealWindowClosed.
    const r0d = await readRound(env, w.round0);
    await warpTo(env, r0d.revealEnd + DEFAULT_APPEAL_WINDOW_SECS + 1n);

    const [appealBond] = await findAppealBondPda({
      dispute: w.dispute,
      roundIdx: 0,
    });
    await expect(
      env.sendIx(
        appeal(
          env.accord.adapter,
          env.programId,
          appealAccounts(w, appealBond),
          new Uint8Array(32),
        ),
      ),
    ).rejects.toThrow();
  }, 200_000);

  it("appeal past max_appeals=0 reverts and opens no round", async () => {
    if (!env.up) return;
    const w = await buildWorldResolved0(env, {
      maxAppeals: 0,
      round0Result: 0,
    });
    const [appealBond] = await findAppealBondPda({
      dispute: w.dispute,
      roundIdx: 0,
    });
    await expect(
      env.sendIx(
        appeal(
          env.accord.adapter,
          env.programId,
          appealAccounts(w, appealBond),
          new Uint8Array(32),
        ),
      ),
    ).rejects.toThrow();
    expect(Number((await readDispute(env, w.dispute)).currentRound)).toBe(0);
  }, 200_000);
});
