// voting.spec.ts — commit / reveal / finalize_round e2e against Surfpool (:8903).
//
// Ports programs/accord/tests/voting_litesvm.rs `happy_commit_reveal_finalize`:
// full round setup (subaccord → stake → createDispute → buildMst → postSnapshot
// → warp(challenge) → finalizeSnapshot → inject VRF → resolvePanel → draw), then
// the commit-reveal cycle across the review/commit/reveal windows, ending in
// `finalize_round` writing the plurality winner to `round.result`.
//
// Window timing (per Subaccord v1 defaults): commit opens at review_end
// (draw_time + 7d), reveal at commit_end (+2d), finalizable at reveal_end (+2d).
import {
  Accord,
  createSubaccord,
  initializePause,
  createDispute,
  requiredFee,
  stake,
  buildMst,
  postSnapshot,
  finalizeSnapshot,
  findSnapshotPda,
  findJurorStakePda,
  findRoundPda,
  resolvePanel,
  draw,
  commit,
  reveal,
  finalizeRound,
  getSnapshotDecoder,
  getPauseStateDecoder,
  getRoundDecoder,
  getDisputeDecoder,
  maxAppealPanelSize,
  panelSizeForRound,
  SNAPSHOT_CHALLENGE_WINDOW_SECS,
} from "@accord/sdk";
import {
  generateKeyPairSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import { createMint, setTokenBalance, TOKEN_PROGRAM_ID } from "./setup/tokens.js";
import { readClock, warpForwardSeconds } from "./setup/cheats.js";
import { injectCommittedVrf } from "./setup/vrf.js";
import { defaultSubaccordArgs, randomBytes32 } from "./setup/fixtures.js";
import { expectAccordAccount, fetchDecoded } from "./setup/assertions.js";

// DisputeState enum: Created=0, SnapshotPosted=1, Drawn=2, Review=3, Commit=4, Reveal=5, RoundResolved=6, Final=7.
const DS_DRAWN = 2;
const DS_ROUND_RESOLVED = 6;

const JURORS_PER_DISPUTE = 3;
const FEE_PER_JUROR = 1_000_000n;
const STAKE_AMOUNT = 5_000n;
const DISPUTE_FEE = requiredFee(JURORS_PER_DISPUTE, FEE_PER_JUROR)!;
const EXPECTED_BOND =
  BigInt(maxAppealPanelSize(JURORS_PER_DISPUTE, 3)) * FEE_PER_JUROR;
const COMMITTED_VRF = new Uint8Array(32).fill(42); // [42u8; 32]

const ADDR_ENC = () => getAddressEncoder();
const ATA_PROGRAM =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;
const encBytes = (a: Address) => new Uint8Array(ADDR_ENC().encode(a));

async function ataOf(mint: Address, owner: Address): Promise<Address> {
  const e = ADDR_ENC();
  const [addr] = await getProgramDerivedAddress({
    programAddress: ATA_PROGRAM,
    seeds: [e.encode(owner), e.encode(TOKEN_PROGRAM_ID), e.encode(mint)],
  });
  return addr;
}

/** Warp forward to an absolute unix timestamp (no-op if already past it). */
async function warpTo(env: TestEnv, targetTs: bigint): Promise<void> {
  const now = (await readClock(env)).unixTimestamp;
  if (targetTs > now) await warpForwardSeconds(env, Number(targetTs - now));
}

function randNonce(): bigint {
  const b = randomBytes32();
  return new DataView(b.buffer).getBigUint64(0, true);
}

interface JurorRow {
  signer: KeyPairSigner;
  address: Address;
  bytes: Uint8Array;
  stakePda: Address;
}

interface Ctx {
  up: boolean;
  rpcUrl: string;
  programId: Address;
  subaccord: Address;
  dispute: Address;
  snapshot: Address;
  round: Address;
  mint: Address;
  /** Drawn jurors (keypair + stakePda) in draw order — the commit/reveal signers. */
  drawn: JurorRow[];
}

let env: TestEnv;
let ctx: Ctx;

describe("e2e: voting commit-reveal-finalize (requires Surfpool on :8903)", () => {
  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return;

    // 1. PauseState (one-shot; skip if a prior run created it).
    const pause = await initializePause(
      env.accord.adapter,
      env.programId,
      env.payer.address,
    );
    if (!(await fetchDecoded(env, pause.pauseState, getPauseStateDecoder()))) {
      await env.sendIx(pause.instruction);
    }

    // 2. Mint + Subaccord.
    const { mint } = await createMint(env, 6);
    const args = defaultSubaccordArgs(mint, env.payer.address, {
      feePerJuror: FEE_PER_JUROR,
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

    // 3. Stake jurors.
    const jurors: JurorRow[] = [];
    for (let i = 0; i < JURORS_PER_DISPUTE; i++) {
      const signer = await fundSigner(env);
      const jurorAta = await ataOf(mint, signer.address);
      await setTokenBalance(env, signer.address, mint, 10_000n);
      const [stakePdaAddr] = await findJurorStakePda({
        subaccord,
        juror: signer.address,
      });
      const jurorAccord = new Accord({ endpoint: env.rpcUrl, signer });
      await env.sendIx(
        stake(
          jurorAccord.adapter,
          env.programId,
          {
            juror: signer.address,
            subaccord,
            pauseState: pause.pauseState,
            jurorStake: stakePdaAddr,
            stakingToken: mint,
            jurorTokenAccount: jurorAta,
            vault,
          },
          STAKE_AMOUNT,
        ),
      );
      jurors.push({
        signer,
        address: signer.address,
        bytes: encBytes(signer.address),
        stakePda: stakePdaAddr,
      });
    }

    // 4. Canonical MST over the juror set.
    const tree = await buildMst(
      jurors.map((j) => ({ juror: j.bytes, stake: STAKE_AMOUNT })),
    );

    // 5. Create dispute (fresh nonce ⇒ fresh PDA ⇒ re-runnable).
    const filerAta = await ataOf(mint, env.payer.address);
    await setTokenBalance(env, env.payer.address, mint, DISPUTE_FEE * 5n);
    const disputeRes = await createDispute(
      env.accord.adapter,
      {
        filer: env.payer.address,
        subaccord,
        stakingToken: mint,
        filerTokenAccount: filerAta,
        vault,
        pauseState: pause.pauseState,
      },
      {
        options: [randomBytes32(), randomBytes32()],
        evidenceHash: randomBytes32(),
        nonce: randNonce(),
        fee: DISPUTE_FEE,
      },
      env.programId,
    );
    await env.sendIx(disputeRes.instruction);
    const dispute = disputeRes.dispute;

    // 6. Poster posts the snapshot, then we wait out the challenge window + finalize.
    const poster = await fundSigner(env);
    const posterAta = await ataOf(mint, poster.address);
    await setTokenBalance(env, poster.address, mint, EXPECTED_BOND * 5n);
    const [snapshot] = await findSnapshotPda({ dispute, roundIdx: 0 });
    const posterAccord = new Accord({ endpoint: env.rpcUrl, signer: poster });
    await env.sendIx(
      postSnapshot(posterAccord.adapter, env.programId, {
        signer: poster.address,
        subaccord,
        dispute,
        snapshot,
        stakingToken: mint,
        vault,
        posterTokenAccount: posterAta,
      }, { rootHash: tree.rootHash, rootSum: tree.rootSum }),
    );
    const snap = (await fetchDecoded(env, snapshot, getSnapshotDecoder()))!;
    await warpTo(env, snap.challengeDeadline + 1n);
    await env.sendIx(
      finalizeSnapshot(env.accord.adapter, env.programId, {
        signer: env.payer.address,
        subaccord,
        dispute,
        snapshot,
        stakingToken: mint,
        vault,
        posterTokenAccount: posterAta,
      }),
    );

    // 7. Inject the committed VRF (the oracle CPI isn't on a Surfnet), then
    //    resolve the distinct panel locally so `draw` lands first try.
    await injectCommittedVrf(env, dispute, COMMITTED_VRF);
    const panelSize = panelSizeForRound(JURORS_PER_DISPUTE, 0)!; // 3
    const { drawAttempt, memberships } = await resolvePanel(
      COMMITTED_VRF,
      encBytes(dispute),
      0,
      panelSize,
      tree,
    );

    // Map drawn memberships → juror keypairs + stake PDAs (draw order).
    const byBytes = new Map(jurors.map((j) => [j.bytes.join(), j]));
    const drawn: JurorRow[] = [];
    const jurorStakeAccounts: Address[] = [];
    for (const m of memberships) {
      const jur = byBytes.get(m.leaf.juror.join());
      if (!jur) throw new Error(`drawn juror not in staked set`);
      drawn.push(jur);
      jurorStakeAccounts.push(jur.stakePda);
    }

    // 8. Draw (permissionless cranker = payer).
    const [round] = await findRoundPda({ dispute, roundIdx: 0 });
    await env.sendIx(
      draw(
        env.accord.adapter,
        env.programId,
        {
          caller: env.payer.address,
          subaccord,
          dispute,
          snapshot,
        },
        round,
        drawAttempt,
        memberships,
        jurorStakeAccounts,
      ),
    );
    await expectAccordAccount(env, round);

    ctx = {
      up: true,
      rpcUrl: env.rpcUrl,
      programId: env.programId,
      subaccord,
      dispute,
      snapshot,
      round,
      mint,
      drawn,
    };
  }, 150_000);

  it("runs commit → reveal → finalize_round, writing the plurality winner", async () => {
    if (!ctx.up) return;
    const roundAcc = (await fetchDecoded(env, ctx.round, getRoundDecoder()))!;
    expect(Number(roundAcc.jurorCount)).toBe(ctx.drawn.length);

    // Commit opens at review_end (= draw_time + review_window).
    await warpTo(env, roundAcc.reviewEnd);
    // Votes [0, 0, 1] ⇒ plurality winner is option 0.
    const votes = [0, 0, 1];
    const salts = ctx.drawn.map((_, i) => {
      const s = new Uint8Array(32);
      s.fill(10 + i);
      return s;
    });
    for (let i = 0; i < ctx.drawn.length; i++) {
      const jur = ctx.drawn[i]!;
      const jurorAccord = new Accord({ endpoint: ctx.rpcUrl, signer: jur.signer });
      const { instruction } = await commit(jurorAccord.adapter, ctx.programId, {
        signer: jur.address,
        subaccord: ctx.subaccord,
        dispute: ctx.dispute,
        round: ctx.round,
      }, { vote: votes[i]!, salt: salts[i]! });
      await env.sendIx(instruction);
    }
    let mid = (await fetchDecoded(env, ctx.round, getRoundDecoder()))!;
    expect(Number(mid.commitCount)).toBe(ctx.drawn.length);

    // Reveal opens at commit_end.
    await warpTo(env, mid.commitEnd);
    for (let i = 0; i < ctx.drawn.length; i++) {
      const jur = ctx.drawn[i]!;
      const jurorAccord = new Accord({ endpoint: ctx.rpcUrl, signer: jur.signer });
      await env.sendIx(
        reveal(jurorAccord.adapter, ctx.programId, {
          signer: jur.address,
          subaccord: ctx.subaccord,
          dispute: ctx.dispute,
          round: ctx.round,
        }, { vote: votes[i]!, salt: salts[i]! }),
      );
    }
    mid = (await fetchDecoded(env, ctx.round, getRoundDecoder()))!;
    expect(Number(mid.revealCount)).toBe(ctx.drawn.length);

    // Finalizable after reveal_end.
    await warpTo(env, mid.revealEnd);
    await env.sendIx(
      finalizeRound(env.accord.adapter, ctx.programId, {
        signer: env.payer.address,
        subaccord: ctx.subaccord,
        dispute: ctx.dispute,
        round: ctx.round,
      }),
    );

    const finalRound = (await fetchDecoded(env, ctx.round, getRoundDecoder()))!;
    expect(finalRound.result).toBe(0); // plurality winner = option 0

    const dispute = (await fetchDecoded(env, ctx.dispute, getDisputeDecoder()))!;
    expect(Number(dispute.state)).toBe(DS_ROUND_RESOLVED);
  }, 120_000);

  it("marks the dispute Drawn after the panel is selected", async () => {
    if (!ctx.up) return;
    // Sanity: by the time voting finalized, the dispute passed through Drawn.
    const dispute = (await fetchDecoded(env, ctx.dispute, getDisputeDecoder()))!;
    expect(Number(dispute.state)).toBeGreaterThanOrEqual(DS_DRAWN);
  }, 30_000);
});
