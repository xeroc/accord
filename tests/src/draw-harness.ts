// draw-harness.ts — shared fixtures + helpers for the draw + full-lifecycle e2e
// specs. Arms the Accord draw pipeline end-to-end against a running Surfpool:
// pause → subaccord → staked jurors (accumulator paths) → create_dispute →
// injectCommittedVrf (freezes root) → draw_seat × N.
//
// Multi-signer model (ADR-0010): the SDK adapter hardcodes `accord.signer` as the
// TransactionSigner for every signing account meta. So a juror signs by building
// its instruction through a per-juror `Accord` facade (`roleAccord`); `env.sendIx`
// then collects both the fee payer (env.payer) and the juror signer via Kit's
// `signTransactionMessageWithSigners`. The juror MUST hold SOL — `stake` makes
// the juror the rent payer for JurorStake + the vault ATA.

import {
  Accord,
  createSubaccord,
  initializePause,
  stake,
  createDispute,
  requiredFee,
  drawSeat,
  resolveSeat,
  buildAccumulator,
  proofFor,
  emptyRoot,
  type MerkleAccumulator,
  type LeafClaim,
  type MSTNode,
  type SeatMembership,
  type CreateSubaccordArgs,
  findJurorStakePda,
  findRoundPda,
  findAccordStatePda,
  Aggregation,
  getDisputeDecoder,
  getRoundDecoder,
  getJurorStakeDecoder,
  getSubaccordDecoder,
} from "@useaccord/sdk";
import {
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import {
  createMint,
  setTokenBalance,
  TOKEN_PROGRAM_ID,
} from "./setup/tokens.js";

import { defaultSubaccordArgs, randomBytes32 } from "./setup/fixtures.js";
import { warpForwardSeconds, readClock } from "./setup/cheats.js";
import { injectCommittedVrf } from "./setup/vrf.js";
import { fetchDecoded } from "./setup/assertions.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed 32-byte committed VRF (injected via surfnet_setAccount). */
export const COMMITTED_VRF = new Uint8Array(32).fill(42);
/** Per-juror stake (above MIN_STAKE 1_000). */
export const STAKE_AMOUNT = 5_000n;
/** Fee per juror. */
export const FEE_PER_JUROR = 1_000_000n;
/** Panel size for round 0 (fixed INITIAL_NUM_JURORS = 3). */
export const PANEL_SIZE = 3;
/** Distinct jurors staked per dispute. */
export const N_JURORS = 3;

// ---------------------------------------------------------------------------
// Byte/address helpers
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

/** SPL Associated Token Account program. */
const ASSOCIATED_TOKEN_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

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

export function roleAccord(env: TestEnv, signer: KeyPairSigner): Accord {
  return new Accord({ endpoint: env.rpcUrl, signer });
}

// ---------------------------------------------------------------------------
// Off-chain accumulator tree tracker
// ---------------------------------------------------------------------------

export class TreeTracker {
  tree!: MerkleAccumulator;
  depth: number;

  constructor(depth: number) {
    this.depth = depth;
  }

  async init() {
    this.tree = await buildAccumulator([], this.depth);
    return this;
  }

  async pathFor(index: number): Promise<MSTNode[]> {
    return proofFor(this.tree, index);
  }

  async setLeaf(index: number, juror: Address, stake: bigint) {
    const leaves = [...this.tree.leaves];
    leaves[index] = { juror: addressBytes(juror), stake };
    this.tree = await buildAccumulator(leaves, this.depth);
  }

  get rootHash(): Uint8Array {
    return this.tree.rootHash;
  }
  get totalStake(): bigint {
    return this.tree.rootSum;
  }
}

// ---------------------------------------------------------------------------
// Clock warp
// ---------------------------------------------------------------------------

export async function warpTo(env: TestEnv, targetSec: bigint): Promise<void> {
  // Read the ON-CHAIN clock — Surfpool's clock is not wall time, so deriving
  // the delta from Date.now() would no-op the warp and close every commit/
  // reveal window. See appeal.spec's local warpTo for the same pattern.
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
  /** Juror's staking-token ATA — reveal pays the participation fee here. */
  jurorAta: Address;
  accord: Accord;
}

export interface DrawFixture {
  env: TestEnv;
  up: boolean;
  mint: Address;
  vault: Address;
  subaccord: Address;
  accordState: Address;
  jurors: JurorCtx[];
  tree: TreeTracker;
  jurorPdaByHex: Map<string, Address>;
}

const ZERO = "11111111111111111111111111111111" as Address;

function offlineFixture(env: TestEnv): DrawFixture {
  return {
    env,
    up: false,
    mint: ZERO,
    vault: ZERO,
    subaccord: ZERO,
    accordState: ZERO,
    jurors: [],
    tree: null as unknown as TreeTracker,
    jurorPdaByHex: new Map(),
  };
}

export async function ensurePause(env: TestEnv): Promise<Address> {
  const [pausePda] = await findAccordStatePda();
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

export async function armSubaccordAndJurors(
  env: TestEnv,
  accordState: Address,
  subaccordOverrides: Partial<CreateSubaccordArgs> = {},
): Promise<Omit<DrawFixture, "env" | "up">> {
  const { mint } = await createMint(env, 6);

  const args = defaultSubaccordArgs(mint, mint, env.payer.address, {
    minStake: 1_000n,
    feePerJuror: FEE_PER_JUROR,
    maxAppeals: 3,
    reviewWindow: 604_800n,
    commitWindow: 172_800n,
    revealWindow: 172_800n,
    ...subaccordOverrides,
  });
  const { instruction: createIx, subaccord } = await createSubaccord(
    env.accord.adapter,
    env.programId,
    env.payer.address,
    args,
  );
  await env.sendIx(createIx);

  const vault = await ataOf(mint, subaccord);
  await setTokenBalance(env, env.payer.address, mint, 2_000_000_000n);

  const tree = await new TreeTracker(4).init();

  const jurors: JurorCtx[] = [];
  const jurorPdaByHex = new Map<string, Address>();
  for (let i = 0; i < N_JURORS; i++) {
    const signer = await fundSigner(env);
    await setTokenBalance(env, signer.address, mint, STAKE_AMOUNT);
    const jurorAccord = roleAccord(env, signer);
    const jurorAta = await ataOf(mint, signer.address);
    const [stakePda] = await findJurorStakePda({
      subaccord,
      juror: signer.address,
    });

    // Accumulator path for index i against the current tree.
    const path = await tree.pathFor(i);
    const stakeIx = stake(
      jurorAccord.adapter,
      env.programId,
      {
        juror: signer.address,
        subaccord,
        accordState,
        jurorStake: stakePda,
        stakingToken: mint,
        jurorTokenAccount: jurorAta,
        stakeVault: vault,
      },
      STAKE_AMOUNT,
      path,
    );
    await env.sendIx(stakeIx);
    await tree.setLeaf(i, signer.address, STAKE_AMOUNT);

    jurors.push({ signer, stakePda, jurorAta, accord: jurorAccord });
    jurorPdaByHex.set(toHex(addressBytes(signer.address)), stakePda);
  }

  return { mint, vault, subaccord, accordState, jurors, tree, jurorPdaByHex };
}

/**
 * Canon variant of `armSubaccordAndJurors`: stake `N_JURORS` into an
 * **already-existing** Subaccord (one created by Canon's `create_list` CPI, not
 * a direct `create_subaccord`). Same accumulator/stake plumbing; the Subaccord
 * PDA + mint come from the caller. `depth` MUST match the Subaccord's tree
 * depth (Canon lists default to depth 8 via `defaultCourtParams()`, not the
 * harness's default 4) so the Merkle paths line up with the on-chain root.
 */
export async function armCanonJurors(
  env: TestEnv,
  accordState: Address,
  subaccord: Address,
  mint: Address,
  depth: number,
): Promise<Omit<DrawFixture, "env" | "up">> {
  const vault = await ataOf(mint, subaccord);
  await setTokenBalance(env, env.payer.address, mint, 2_000_000_000n);
  const tree = await new TreeTracker(depth).init();

  const jurors: JurorCtx[] = [];
  const jurorPdaByHex = new Map<string, Address>();
  for (let i = 0; i < N_JURORS; i++) {
    const signer = await fundSigner(env);
    await setTokenBalance(env, signer.address, mint, STAKE_AMOUNT);
    const jurorAccord = roleAccord(env, signer);
    const jurorAta = await ataOf(mint, signer.address);
    const [stakePda] = await findJurorStakePda({ subaccord, juror: signer.address });
    const path = await tree.pathFor(i);
    await env.sendIx(
      stake(
        jurorAccord.adapter,
        env.programId,
        {
          juror: signer.address,
          subaccord,
          accordState,
          jurorStake: stakePda,
          stakingToken: mint,
          jurorTokenAccount: jurorAta,
          stakeVault: vault,
        },
        STAKE_AMOUNT,
        path,
      ),
    );
    await tree.setLeaf(i, signer.address, STAKE_AMOUNT);
    jurors.push({ signer, stakePda, jurorAta, accord: jurorAccord });
    jurorPdaByHex.set(toHex(addressBytes(signer.address)), stakePda);
  }
  return { mint, vault, subaccord, accordState, jurors, tree, jurorPdaByHex };
}

export async function setupDrawFixture(): Promise<DrawFixture> {
  const env = await createTestEnv();
  if (!env.up) return offlineFixture(env);
  const accordState = await ensurePause(env);
  const core = await armSubaccordAndJurors(env, accordState);
  return { env, up: true, ...core };
}

// ---------------------------------------------------------------------------
// Per-dispute arm: create_dispute → injectCommittedVrf (freezes root)
// ---------------------------------------------------------------------------

export interface ArmedDispute {
  dispute: Address;
  disputeBytes: Uint8Array;
}

export async function armDispute(
  fx: DrawFixture,
  nonce: bigint,
  options: Uint8Array[] = [
    new Uint8Array(32).fill(1),
    new Uint8Array(32).fill(2),
  ],
  aggregation: Aggregation = Aggregation.Plurality,
): Promise<ArmedDispute> {
  const { env, subaccord, mint, vault, accordState } = fx;
  const fee = requiredFee(FEE_PER_JUROR);
  if (fee === null) throw new Error("fee overflow");

  const filerAta = await ataOf(mint, env.payer.address);

  const { instruction: cdIx, dispute } = await createDispute(
    env.accord.adapter,
    {
      filer: env.payer.address,
      rentPayer: env.payer.address,
      subaccord,
      feeToken: mint,
      filerTokenAccount: filerAta,
      feeVault: vault,
      accordState,
    },
    {
      options,
      evidenceHash: randomBytes32(),
      nonce,
      fee,
      aggregation,
    },
    env.programId,
  );
  await env.sendIx(cdIx);

  // Inject VRF + freeze the accumulator root (the Subaccord's live root at
  // callback time — all draw_seat calls select against this frozen root).
  await injectCommittedVrf(
    env,
    dispute,
    COMMITTED_VRF,
    fx.tree.rootHash,
    fx.tree.totalStake,
  );

  return { dispute, disputeBytes: addressBytes(dispute) };
}

// ---------------------------------------------------------------------------
// Draw helpers (accumulator + draw_seat with deterministic collision re-roll)
// ---------------------------------------------------------------------------

/**
 * Resolve the full N-seat panel using deterministic collision re-roll
 * (bean accord-tzo0). Returns SeatMembership[] with the correct `retries`
 * embedded per seat.
 */
export async function resolveDistinctPanel(
  fx: DrawFixture,
  armed: ArmedDispute,
): Promise<SeatMembership[]> {
  const { tree, jurorPdaByHex } = fx;
  const memberships: SeatMembership[] = [];
  const drawnJurors: Uint8Array[] = [];

  for (let seat = 0; seat < PANEL_SIZE; seat++) {
    const resolved = await resolveSeat(
      COMMITTED_VRF,
      armed.disputeBytes,
      0,
      seat,
      tree.tree,
      drawnJurors,
    );
    const pda = jurorPdaByHex.get(toHex(resolved.leaf.juror));
    if (!pda)
      throw new Error(
        `no JurorStake PDA for juror ${toHex(resolved.leaf.juror)}`,
      );

    memberships.push({
      leaf: resolved.leaf,
      index: resolved.index,
      proof: resolved.proof,
      jurorStake: pda,
      retries: resolved.retries,
    });
    drawnJurors.push(resolved.leaf.juror);
  }
  return memberships;
}

export function jurorStakeAccountsFor(
  _fx: DrawFixture,
  memberships: SeatMembership[],
): Address[] {
  return memberships.map((m) => m.jurorStake);
}

/**
 * Submit draw_seat for each seat in the panel. Returns the round PDA.
 */
export async function submitDraw(
  fx: DrawFixture,
  armed: ArmedDispute,
  memberships: SeatMembership[],
): Promise<Address> {
  const { env } = fx;
  const [roundPda] = await findRoundPda({
    dispute: armed.dispute,
    roundIdx: 0,
  });

  for (let seat = 0; seat < memberships.length; seat++) {
    const m = memberships[seat]!;
    const ix = drawSeat(
      env.accord.adapter,
      env.programId,
      {
        caller: env.payer.address,
        subaccord: fx.subaccord,
        dispute: armed.dispute,
      },
      roundPda,
      seat,
      m,
    );
    await env.sendIx(ix);
  }
  return roundPda;
}

// ---------------------------------------------------------------------------
// Account readers
// ---------------------------------------------------------------------------

export interface RoundView {
  jurorCount: number;
  commitCount: number;
  revealCount: number;
  jurors: Address[];
  result: bigint;
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
    commitCount: d.commitCount,
    revealCount: d.revealCount,
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
  return Number(d.state as number);
}

export async function readDisputeFinalRuling(
  env: TestEnv,
  dispute: Address,
): Promise<bigint | null> {
  const d = await fetchDecoded(env, dispute, getDisputeDecoder());
  if (!d) return null;
  const fr = d.finalRuling;
  // u64::MAX sentinel (ADR-0025) — no ruling yet.
  return fr === 0xffff_ffff_ffff_ffffn ? null : fr;
}

export async function readJurorActiveDraws(
  env: TestEnv,
  stakePda: Address,
): Promise<number | null> {
  const d = await fetchDecoded(env, stakePda, getJurorStakeDecoder());
  if (!d) return null;
  return d.activeDraws;
}
