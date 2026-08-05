// draw-harness.ts — shared fixtures + helpers for the draw + full-lifecycle e2e
// specs (M5). Arms the Accord draw pipeline end-to-end against a running
// Surfpool: pause → subaccord → staked jurors → Merkle-Sum Tree, then per-dispute
// create_dispute → post_snapshot → (warp) → finalize_snapshot → injectCommittedVrf.
//
// Multi-signer model (ADR-0010): the SDK adapter hardcodes `accord.signer` as the
// TransactionSigner for every signing account meta. So a juror signs by building
// its instruction through a per-juror `Accord` facade (`roleAccord`); `env.sendIx`
// then collects both the fee payer (env.payer) and the juror signer via Kit's
// `signTransactionMessageWithSigners`. The juror MUST hold SOL — `stake` makes
// the juror the rent payer for JurorStake + the vault ATA (lib.rs:1728-1752).

import {
  Accord,
  createSubaccord,
  initializePause,
  stake,
  createDispute,
  requiredFee,
  postSnapshot,
  finalizeSnapshot,
  draw,
  resolvePanel,
  drawSlots,
  isDistinctPanel,
  buildMst,
  buildMemberships,
  findJurorStakePda,
  findRoundPda,
  findSnapshotPda,
  findPauseStatePda,
  getDisputeDecoder,
  getRoundDecoder,
  getJurorStakeDecoder,
  getSnapshotDecoder,
  type MerkleSumTree,
} from "@accord/sdk";
import {
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import { createMint, setTokenBalance, TOKEN_PROGRAM_ID } from "./setup/tokens.js";

import { defaultSubaccordArgs, randomBytes32 } from "./setup/fixtures.js";
import { readClock, warpForwardSeconds } from "./setup/cheats.js";
import { injectCommittedVrf } from "./setup/vrf.js";
import { fetchDecoded } from "./setup/assertions.js";


// ---------------------------------------------------------------------------
// Byte-oriented MST membership type
//
// `@accord/sdk`'s PUBLIC `JurorMembership` re-exports the generated,
// Address-oriented variant (`leaf.juror: Address`). But `resolvePanel` /
// `buildMemberships` / `draw` actually exchange the byte-oriented internal type
// (`leaf.juror: Uint8Array`) — a name collision. This concrete mirror matches
// that internal shape so the harness stays structurally compatible without
// reaching past the public API.
// ---------------------------------------------------------------------------
export interface ByteMembership {
  leaf: { juror: Uint8Array; stake: bigint; cumAfter: bigint };
  proof: { siblingHash: Uint8Array; siblingSum: bigint }[];
  index: number;
}
// ---------------------------------------------------------------------------
// Constants — mirror the draw_litesvm blueprint (draw_litesvm.rs:24-30).
// ---------------------------------------------------------------------------

/** Fixed 32-byte committed VRF (blueprint `COMMITTED_VRF = [42u8; 32]`). */
export const COMMITTED_VRF = new Uint8Array(32).fill(42);
/** Per-juror stake (blueprint STAKE_AMOUNT = 5_000; > MIN_STAKE 1_000). */
export const STAKE_AMOUNT = 5_000n;
/** Fee per juror (blueprint FEE_PER_JUROR = 1_000_000). */
export const FEE_PER_JUROR = 1_000_000n;
/** Panel size for round 0 with jurors_per_dispute=3 → panelSizeForRound(3,0)=3. */
export const PANEL_SIZE = 3;
/** Distinct jurors staked per dispute. */
export const N_JURORS = 3;

// ---------------------------------------------------------------------------
// Byte/address helpers (used at 3+ call sites; name the encoding once)
// ---------------------------------------------------------------------------

export function toHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

export function toAddress(bytes: Uint8Array): Address {
  return getAddressDecoder().decode(bytes) as Address;
}

export function addressBytes(a: Address): Uint8Array {
  return new Uint8Array(getAddressEncoder().encode(a));
}

/** SPL Associated Token Account program ( ATA PDA program owner). */
const ASSOCIATED_TOKEN_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

/**
 * Associated token account for (mint, owner). Derived as the canonical ATA PDA
 * `["wallet", token_program, "mint"]` under the Associated Token Program — the
 * same address spl-token's getAssociatedTokenAddress returns, but via Kit's
 * PDA derivation (avoids pulling @solana/web3.js v1 into the jest ESM graph).
 * Works for PDA owners (the Subaccord vault) since PDA derivation is seed-only.
 */
export async function ataOf(mint: Address, owner: Address): Promise<Address> {
  const [ata] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ID,
    seeds: [
      getAddressEncoder().encode(owner),
      getAddressEncoder().encode(TOKEN_PROGRAM_ID),
      getAddressEncoder().encode(mint),
    ],
  });
  return ata;
}

/** Build a per-signer Accord facade so its keypair is baked into built ixs. */
export function roleAccord(env: TestEnv, signer: KeyPairSigner): Accord {
  return new Accord({ endpoint: env.rpcUrl, signer });
}

// ---------------------------------------------------------------------------
// Clock warp — every warp computed from the LIVE clock (serial suite, global).
// ---------------------------------------------------------------------------

export async function warpTo(env: TestEnv, targetSec: bigint): Promise<void> {
  const now = (await readClock(env)).unixTimestamp;
  const delta = BigInt(targetSec) - now + 1n;
  if (delta > 0n) await warpForwardSeconds(env, delta);
}

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

export interface JurorCtx {
  signer: KeyPairSigner;
  stakePda: Address;
  /** Per-juror facade (signer baked into stake/commit/reveal ixs). */
  accord: Accord;
}

export interface DrawFixture {
  env: TestEnv;
  up: boolean;
  mint: Address;
  vault: Address;
  subaccord: Address;
  pauseState: Address;
  jurors: JurorCtx[];
  tree: MerkleSumTree;
  /** hex(juror pubkey bytes) → JurorStake PDA, for mapping memberships back. */
  jurorPdaByHex: Map<string, Address>;
}

const ZERO = "11111111111111111111111111111111" as Address;
const EMPTY_TREE: MerkleSumTree = {
  leaves: [],
  nodes: [],
  rootHash: new Uint8Array(32),
  rootSum: 0n,
};

/** Offline-lane placeholder (env.up === false): specs gate each `it` on `up`. */
function offlineFixture(env: TestEnv): DrawFixture {
  return {
    env,
    up: false,
    mint: ZERO,
    vault: ZERO,
    subaccord: ZERO,
    pauseState: ZERO,
    jurors: [],
    tree: EMPTY_TREE,
    jurorPdaByHex: new Map(),
  };
}

/**
 * Idempotent PauseState init. PauseState is the one singleton (shared across
 * every spec on this Surfnet); the first spec to run inits it, later specs skip.
 */
export async function ensurePause(env: TestEnv): Promise<Address> {
  const [pausePda] = await findPauseStatePda();
  const acc = await env.rpc
    .getAccountInfo(pausePda, { encoding: "base64" })
    .send();
  if (acc.value) return pausePda;
  const { instruction } = await initializePause(
    env.accord.adapter,
    env.programId,
    env.payer.address,
  );
  await env.sendIx(instruction);
  return pausePda;
}

/**
 * Arm the subaccord + juror pool + MST core (everything past pause). Reused by
 * the draw spec's beforeAll and the full-lifecycle spec's single `it` so the
 * crown spec can drive the entire state machine — including subaccord + stake —
 * in one test. `pauseState` must already be ensured (call {@link ensurePause}).
 */
export async function armSubaccordAndJurors(
  env: TestEnv,
  pauseState: Address,
): Promise<Omit<DrawFixture, "env" | "up">> {
  const { mint } = await createMint(env, 6);

  // Subaccord — payer is the creator (immutable: authority = default pubkey).
  const args = defaultSubaccordArgs(mint, env.payer.address, {
    minStake: 1_000n,
    jurorsPerDispute: N_JURORS,
    feePerJuror: FEE_PER_JUROR,
    maxAppeals: 3,
    reviewWindow: 604_800n,
    commitWindow: 172_800n,
    revealWindow: 172_800n,
  });
  const { instruction: createIx, subaccord } = await createSubaccord(
    env.accord.adapter,
    env.programId,
    env.payer.address,
    args,
  );
  await env.sendIx(createIx);


  const vault = await ataOf(mint, subaccord);
  // bond (31M, returned on finalize) for multiple disputes in this spec.
  await setTokenBalance(env, env.payer.address, mint, 2_000_000_000n);

  // Stake N distinct jurors. Each juror signs its own stake (per-juror facade)
  // and is the rent payer for JurorStake + the vault ATA (first staker creates
  // the vault). fundSigner airdrops SOL so the juror can cover that rent.
  const jurors: JurorCtx[] = [];
  const jurorInputs: { juror: Uint8Array; stake: bigint }[] = [];
  for (let i = 0; i < N_JURORS; i++) {
    const signer = await fundSigner(env);
    await setTokenBalance(env, signer.address, mint, STAKE_AMOUNT);
    const jurorAccord = roleAccord(env, signer);
    const jurorAta = await ataOf(mint, signer.address);
    const [stakePda] = await findJurorStakePda({
      subaccord,
      juror: signer.address,
    });
    const stakeIx = stake(
      jurorAccord.adapter,
      env.programId,
      {
        juror: signer.address,
        subaccord,
        pauseState,
        jurorStake: stakePda,
        stakingToken: mint,
        jurorTokenAccount: jurorAta,
        vault,
      },
      STAKE_AMOUNT,
    );
    await env.sendIx(stakeIx);
    jurors.push({ signer, stakePda, accord: jurorAccord });
    jurorInputs.push({ juror: addressBytes(signer.address), stake: STAKE_AMOUNT });
  }

  const tree = await buildMst(jurorInputs);

  const jurorPdaByHex = new Map<string, Address>();
  for (const j of jurors) {
    jurorPdaByHex.set(toHex(addressBytes(j.signer.address)), j.stakePda);
  }

  return { mint, vault, subaccord, pauseState, jurors, tree, jurorPdaByHex };
}

/**
 * Arm the shared draw fixture (env + pause + subaccord + jurors + MST). Use in
 * a spec's `beforeAll`. For the full-lifecycle crown spec that wants to drive
 * subaccord + stake inside its own `it`, call `createTestEnv` + `ensurePause` +
 * {@link armSubaccordAndJurors} directly instead.
 */
export async function setupDrawFixture(): Promise<DrawFixture> {
  const env = await createTestEnv();
  if (!env.up) return offlineFixture(env);
  const pauseState = await ensurePause(env);
  const core = await armSubaccordAndJurors(env, pauseState);
  return { env, up: true, ...core };
}

// ---------------------------------------------------------------------------
// Per-dispute arm: create_dispute → post_snapshot → warp → finalize → inject VRF
// ---------------------------------------------------------------------------

export interface ArmedDispute {
  dispute: Address;
  snapshot: Address;
  /** 32-byte encoding of the dispute PDA (input to vrfSeed). */
  disputeBytes: Uint8Array;
}

/**
 * Arm a fresh dispute on the fixture's subaccord up to (but NOT including) draw:
 * create_dispute (filer=payer) → post_snapshot → warp past the 1-day challenge
 * window → finalize_snapshot → injectCommittedVrf. Returns the dispute + snapshot
 * PDAs ready for resolvePanel + draw.
 */
export async function armDispute(
  fx: DrawFixture,
  nonce: bigint,
): Promise<ArmedDispute> {
  const { env, subaccord, mint, vault, tree, pauseState } = fx;
  const fee = requiredFee(N_JURORS, FEE_PER_JUROR);
  if (fee === null) throw new Error("fee overflow");

  const filerAta = await ataOf(mint, env.payer.address);

  const { instruction: cdIx, dispute } = await createDispute(
    env.accord.adapter,
    {
      filer: env.payer.address,
      subaccord,
      stakingToken: mint,
      filerTokenAccount: filerAta,
      vault,
      pauseState,
    },
    {
      options: [new Uint8Array(32).fill(1), new Uint8Array(32).fill(2)],
      evidenceHash: randomBytes32(),
      nonce,
      fee,
    },
    env.programId,
  );
  await env.sendIx(cdIx);

  const [snapshot] = await findSnapshotPda({ dispute, roundIdx: 0 });

  const postIx = postSnapshot(
    env.accord.adapter,
    env.programId,
    {
      signer: env.payer.address,
      subaccord,
      dispute,
      snapshot,
      stakingToken: mint,
      vault,
      posterTokenAccount: filerAta,
    },
    tree,
  );
  await env.sendIx(postIx);

  // Warp past the snapshot challenge deadline (read from the posted snapshot).
  const snap = await fetchDecoded(env, snapshot, getSnapshotDecoder());
  if (!snap) throw new Error("snapshot not found after post_snapshot");
  await warpTo(env, snap.challengeDeadline + 1n);

  const finIx = finalizeSnapshot(
    env.accord.adapter,
    env.programId,
    {
      signer: env.payer.address,
      subaccord,
      dispute,
      snapshot,
      stakingToken: mint,
      vault,
      posterTokenAccount: filerAta,
    },
  );
  await env.sendIx(finIx);

  await injectCommittedVrf(env, dispute, COMMITTED_VRF);

  return { dispute, snapshot, disputeBytes: addressBytes(dispute) };
}

// ---------------------------------------------------------------------------
// Draw helpers
// ---------------------------------------------------------------------------

/** Resolve the first distinct-panel draw_attempt over the fixture's MST. */
export async function resolveDistinctPanel(
  fx: DrawFixture,
  armed: ArmedDispute,
): Promise<{ drawAttempt: number; memberships: ByteMembership[] }> {
  return resolvePanel(COMMITTED_VRF, armed.disputeBytes, 0, PANEL_SIZE, fx.tree);
}

/** Find the first draw_attempt whose sortition naturally collides (≥2 same juror). */
export async function findCollisionPanel(
  fx: DrawFixture,
  armed: ArmedDispute,
): Promise<{ drawAttempt: number; memberships: ByteMembership[] }> {
  for (let attempt = 0; attempt < 4096; attempt++) {
    const slots = await drawSlots(
      COMMITTED_VRF,
      armed.disputeBytes,
      0,
      attempt,
      PANEL_SIZE,
      fx.tree.rootSum,
    );
    const memberships = buildMemberships(fx.tree, slots);
    if (!isDistinctPanel(memberships)) return { drawAttempt: attempt, memberships };
  }
  throw new Error("no collision draw_attempt found");
}

/** Map a panel's memberships to their JurorStake PDAs (in membership order). */
export function jurorStakeAccountsFor(
  fx: DrawFixture,
  memberships: ByteMembership[],
): Address[] {
  return memberships.map((m) => {
    const pda = fx.jurorPdaByHex.get(toHex(m.leaf.juror));
    if (!pda) throw new Error(`no JurorStake PDA for juror ${toHex(m.leaf.juror)}`);
    return pda;
  });
}

/**
 * Submit a `draw` (caller = payer, permissionless). Returns the round-0 PDA.
 * The memberships must already be valid — distinct for success, or colliding
 * for the DuplicateJuror revert case (the SDK rejects mismatched array lengths
 * up front; the chain checks distinctness before touching remaining_accounts).
 */
export async function submitDraw(
  fx: DrawFixture,
  armed: ArmedDispute,
  drawAttempt: number,
  memberships: ByteMembership[],
  jurorStakeAccounts: Address[],
): Promise<Address> {
  const { env, subaccord } = fx;
  const [roundPda] = await findRoundPda({ dispute: armed.dispute, roundIdx: 0 });
  const ix = draw(
    env.accord.adapter,
    env.programId,
    {
      caller: env.payer.address,
      subaccord,
      dispute: armed.dispute,
      snapshot: armed.snapshot,
    },
    roundPda,
    drawAttempt,
    memberships,
    jurorStakeAccounts,
  );
  await env.sendIx(ix);
  return roundPda;
}

// ---------------------------------------------------------------------------
// Account readers (decoded views for assertions)
// ---------------------------------------------------------------------------

export interface RoundView {
  jurorCount: number;
  jurors: Address[];
  result: number;
  reviewEnd: bigint;
  commitEnd: bigint;
  revealEnd: bigint;
}

export async function readRound(
  env: TestEnv,
  roundPda: Address,
): Promise<RoundView | null> {
  const d = await fetchDecoded(env, roundPda, getRoundDecoder());
  if (!d) return null;
  return {
    jurorCount: d.jurorCount,
    jurors: [...d.jurors].slice(0, d.jurorCount) as Address[],
    result: d.result,
    reviewEnd: d.reviewEnd,
    commitEnd: d.commitEnd,
    revealEnd: d.revealEnd,
  };
}

export async function readDisputeState(
  env: TestEnv,
  dispute: Address,
): Promise<number | null> {
  const d = await fetchDecoded(env, dispute, getDisputeDecoder());
  if (!d) return null;
  // DisputeState is a numeric enum (getEnumDecoder); the raw value is the tag.
  return Number(d.state as number);
}

export async function readDisputeFinalRuling(
  env: TestEnv,
  dispute: Address,
): Promise<number | null> {
  const d = await fetchDecoded(env, dispute, getDisputeDecoder());
  if (!d) return null;
  // final_ruling is a u8 on-chain (u8::MAX sentinel = no ruling yet, mirroring
  // Round). The generated decoder yields a plain number.
  const fr = d.finalRuling;
  return fr === 255 ? null : Number(fr);
}

export async function readJurorActiveDraws(
  env: TestEnv,
  stakePda: Address,
): Promise<number | null> {
  const d = await fetchDecoded(env, stakePda, getJurorStakeDecoder());
  if (!d) return null;
  return d.activeDraws;
}
