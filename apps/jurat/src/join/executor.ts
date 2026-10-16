/**
 * executor.ts — join a Subaccord: balance checks, the SDK `stake` instruction,
 * budget accounting, and the joined-subaccord book (bean accord-5pkj).
 *
 * The executor is the action half of join policy (feature accord-n5v4): the
 * pure gate evaluator (src/join/gates.ts, bean accord-spht) decides whether a
 * Subaccord is worth joining; the executor turns an accepted candidate into a
 * confirmed on-chain stake without ever violating the configured budget,
 * per-subaccord cap, or reserve floor (milestone accord-g69g, decision 3).
 *
 * All impure chain access rides the {@link JoinChain} seam so the unit suite
 * runs against a fake client; the real client (src/chain/client.ts, bean
 * accord-lii9) implements it over the Accord facade. PDA derivation,
 * accumulator math, and instruction building come from `@useaccord/sdk`
 * directly — no second implementation.
 *
 * Proof construction is free-list-aware (RECLAIM-LEAF, accord-b5v5):
 * `prepareStakeProof` assumes a new staker lands at `nextIndex`, but the
 * on-chain handler assigns a popped free-list slot instead when
 * `free_head != u32::MAX` — and a reclaimed slot's accumulator leaf is the
 * blanked `(default, 0)`, not the JurorStake account's own fields. We rebuild
 * the tree with free-list leaves blanked (walking the list from `free_head`)
 * and pick the slot + remaining-account neighbors the on-chain handler
 * expects (pop-the-head for new stakers, splice-self-out for a returning
 * juror whose slot was reclaimed).
 */

import {
  address,
  getAddressEncoder,
  type Address,
  type Instruction,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  buildAccumulator,
  findAccordStatePda,
  findAssociatedTokenAddress,
  findJurorStakePda,
  proofFor,
  stake as stakeInstruction,
  type AccordStakingClient,
  type LeafClaim,
  type MSTNode,
  type StakingAccounts,
  type Subaccord,
} from "@useaccord/sdk";

import { loadBook, saveBook, totalStaked, upsertEntry } from "./book.js";

/**
 * Budget / risk caps for joins. Fed from config (src/config.ts, bean
 * accord-jxpn); values are staking-token base units resp. lamports.
 */
export interface JoinBudget {
  /** Max total staked across all joined Subaccords (book sum, per staking token). */
  readonly globalStakeBudget: bigint;
  /** Max staked in any single Subaccord. */
  readonly perSubaccordCap: bigint;
  /** Staking-token balance Jurat must always retain (never stake into it). */
  readonly reserveFloor: bigint;
  /** SOL floor for transaction fees. */
  readonly minSolLamports: bigint;
}

/** The decoded JurorStake fields the executor needs (one Subaccord's set). */
export interface JoinStakeRow {
  readonly address: Address;
  readonly juror: Address;
  readonly staked: bigint;
  readonly treeIndex: number;
  readonly prevFree: number;
  readonly nextFree: number;
}

/**
 * Impure chain surface for the executor. Implemented by the chain client
 * (bean accord-lii9) over `@useaccord/sdk`; faked in the unit suite.
 */
export interface JoinChain {
  readonly programId: Address;
  /** The Accord facade's adapter satisfies this (Codama `buildStake` seam). */
  readonly staking: Pick<AccordStakingClient, "buildStake">;
  fetchSubaccord(subaccord: Address): Promise<Subaccord | null>;
  /** Every JurorStake of the Subaccord (any order). */
  fetchJurorStakes(subaccord: Address): Promise<JoinStakeRow[]>;
  /** Balance of `owner`'s ATA for `mint`. */
  tokenBalance(owner: Address, mint: Address): Promise<bigint>;
  solBalance(owner: Address): Promise<bigint>;
  /** Sign, send, and confirm one instruction; returns the signature. */
  send(instruction: Instruction): Promise<string>;
}

export type JoinRejectReason =
  | "OverGlobalBudget"
  | "OverSubaccordCap"
  | "InsufficientTokenBalance"
  | "InsufficientSolBalance"
  | "AttestationGated";

export type JoinOutcome =
  | {
      status: "joined";
      subaccord: Address;
      amount: bigint;
      signature: string;
    }
  | { status: "already-joined"; subaccord: Address; staked: bigint }
  | {
      status: "rejected";
      subaccord: Address;
      reason: JoinRejectReason;
      detail: string;
    };

const U32_MAX = 0xffff_ffff;
/** Solana `Pubkey::default()` — an unset `juror_credential` (stake-only pool). */
const DEFAULT_PUBKEY: Address = address("1".repeat(32));

/** The stake slot + free-list neighbor accounts the on-chain handler expects. */
interface StakeSlot {
  index: number;
  path: MSTNode[];
  /** RECLAIM-LEAF neighbor #1 (popped head, or splice predecessor). */
  freedSlotAccount?: Address;
  /** RECLAIM-LEAF neighbor #2 (new head, or splice successor). */
  nextNeighborAccount?: Address;
}

/**
 * Join `subaccord` for `juror`.
 *
 * Ordering: cheap Subaccord-local rejects first, then on-chain idempotency,
 * then balances, then the accumulator proof (throws on stale state), then
 * send + book write. Idempotent by construction: an existing on-chain stake
 * short-circuits to `already-joined` and reconciles the book (crash between
 * send and book-write heals on re-run), and a rejected join never sends.
 */
export async function joinSubaccord(
  chain: JoinChain,
  opts: {
    juror: Address;
    subaccord: Address;
    budget: JoinBudget;
    stateDir: string;
  },
): Promise<JoinOutcome> {
  const { juror, subaccord: subAddr, budget, stateDir } = opts;
  const reject = (reason: JoinRejectReason, detail: string): JoinOutcome => ({
    status: "rejected",
    subaccord: subAddr,
    reason,
    detail,
  });

  const sub = await chain.fetchSubaccord(subAddr);
  if (!sub) {
    throw new Error(`SubaccordNotFound: ${subAddr}`);
  }
  // The join amount IS the pool's own minimum — the least stake that carries
  // draw weight. Upstaking is manual (milestone decision 9); there is no
  // configured per-join amount (it could not be unit-correct across mints).
  const amount = sub.minStake;

  // --- Subaccord-local guards (no chain reads beyond `sub`) -----------------

  if (amount <= 0n) {
    throw new Error(`InvalidAmount: min_stake must be > 0, got ${amount}`);
  }
  if (sub.jurorCredential !== DEFAULT_PUBKEY || sub.jurorSchema !== DEFAULT_PUBKEY) {
    return reject(
      "AttestationGated",
      `${subAddr} requires a SAS attestation (juror_credential set); v1 jurat holds none`,
    );
  }
  if (amount > budget.perSubaccordCap) {
    return reject(
      "OverSubaccordCap",
      `min_stake ${amount} > per-subaccord cap ${budget.perSubaccordCap}`,
    );
  }

  // --- Budget accounting against the book ------------------------------------
  // This pool's own entry is excluded: a re-stake replaces it rather than
  // double-counting (the on-chain stake is the truth the book records).

  // Budgets are per staking token: only entries in THIS pool's mint count
  // (a single global sum would add USDC against a house token).
  const book = await loadBook(stateDir);
  const others = {
    entries: book.entries.filter(
      (e) => e.subaccord !== subAddr && e.stakingToken === sub.stakingToken,
    ),
  };
  const stakedElsewhere = totalStaked(others);
  if (stakedElsewhere + amount > budget.globalStakeBudget) {
    return reject(
      "OverGlobalBudget",
      `join ${amount} + already staked ${stakedElsewhere} > budget ${budget.globalStakeBudget} (headroom ${budget.globalStakeBudget - stakedElsewhere})`,
    );
  }

  // --- On-chain idempotency ---------------------------------------------------

  const stakes = await chain.fetchJurorStakes(subAddr);
  const own = stakes.find((s) => s.juror === juror);
  if (own && own.staked > 0n) {
    if (!book.entries.some((e) => e.subaccord === subAddr)) {
      await saveBook(
        stateDir,
        upsertEntry(book, {
          subaccord: subAddr,
          stakingToken: sub.stakingToken,
          staked: own.staked,
          signature: "reconciled",
          joinedAt: new Date().toISOString(),
        }),
      );
    }
    return { status: "already-joined", subaccord: subAddr, staked: own.staked };
  }

  // --- Balance checks (reserve floor: never stake below the configured line) --

  const token = await chain.tokenBalance(juror, sub.stakingToken);
  if (token < amount + budget.reserveFloor) {
    return reject(
      "InsufficientTokenBalance",
      `ATA balance ${token} < stake ${amount} + reserve floor ${budget.reserveFloor}`,
    );
  }
  const sol = await chain.solBalance(juror);
  if (sol < budget.minSolLamports) {
    return reject("InsufficientSolBalance", `SOL ${sol} < fee floor ${budget.minSolLamports}`);
  }

  // --- Proof + slot selection (throws on stale accumulator state) -------------

  const slot = await resolveStakeSlot(sub, stakes, juror);

  // --- Build + send ------------------------------------------------------------

  const [jurorStakePda] = await findJurorStakePda({
    subaccord: subAddr,
    juror,
  });
  const accounts: StakingAccounts = {
    juror,
    subaccord: subAddr,
    accordState: (await findAccordStatePda())[0],
    jurorStake: jurorStakePda,
    stakingToken: sub.stakingToken,
    jurorTokenAccount: await findAssociatedTokenAddress(sub.stakingToken, juror),
    stakeVault: await findAssociatedTokenAddress(sub.stakingToken, subAddr),
  };
  const ix = stakeInstruction(
    // SDK `stake()` only reads `buildStake`; the Pick<…> seam is exactly the
    // executor's dependency surface (the fake implements nothing else).
    chain.staking as AccordStakingClient,
    chain.programId,
    accounts,
    amount,
    slot.path,
    undefined,
    slot.freedSlotAccount,
    slot.nextNeighborAccount,
  );
  const signature = await chain.send(ix);

  await saveBook(
    stateDir,
    upsertEntry(book, {
      subaccord: subAddr,
      stakingToken: sub.stakingToken,
      staked: amount,
      signature,
      joinedAt: new Date().toISOString(),
    }),
  );

  return { status: "joined", subaccord: subAddr, amount, signature };
}

/**
 * Rebuild the canonical accumulator (free-list leaves blanked), verify it
 * against the stored root, and resolve the slot the on-chain handler will
 * assign plus the neighbor remaining-accounts it requires.
 */
async function resolveStakeSlot(
  sub: Subaccord,
  stakes: readonly JoinStakeRow[],
  juror: Address,
): Promise<StakeSlot> {
  const size = 2 ** sub.depth;
  const byIndex = new Map<number, JoinStakeRow>(stakes.map((s) => [s.treeIndex, s] as const));

  // Walk the free list from freeHead; every reachable slot's leaf is the
  // blanked `(default, 0)` (reclaim_slot zeroed it in the tree; the account
  // keeps its juror field, so raw accounts alone cannot rebuild the root).
  const freeSlots = new Set<number>();
  let cur = sub.freeHead;
  while (cur !== U32_MAX && !freeSlots.has(cur)) {
    freeSlots.add(cur);
    const node = byIndex.get(cur);
    if (!node) {
      throw new Error(
        `FreeListBroken: free_head walks to slot ${cur} but no JurorStake exists there (stale fetch?)`,
      );
    }
    cur = node.nextFree;
  }

  const enc = getAddressEncoder();
  const leaves: LeafClaim[] = Array.from({ length: size }, () => ({
    juror: new Uint8Array(32),
    stake: 0n,
  }));
  for (const s of stakes) {
    if (s.treeIndex < 0 || s.treeIndex >= size) {
      throw new Error(`InvalidTreeIndex: ${s.treeIndex} out of range for depth ${sub.depth}`);
    }
    leaves[s.treeIndex] = freeSlots.has(s.treeIndex)
      ? { juror: new Uint8Array(32), stake: 0n }
      : { juror: new Uint8Array(enc.encode(s.juror)), stake: s.staked };
  }

  const accumulator = await buildAccumulator(leaves, sub.depth);
  if (!bytesEqual(accumulator.rootHash, sub.rootHash)) {
    throw new Error(
      "AccumulatorRootMismatch: local rebuild does not match on-chain root. " +
        "Data may be stale — retry with fresh JurorStake accounts.",
    );
  }

  const own = stakes.find((s) => s.juror === juror);
  if (own && freeSlots.has(own.treeIndex)) {
    // Returning juror whose slot was reclaimed: splice self out of the list.
    // The handler wants the predecessor (if any) then the successor (if any).
    return {
      index: own.treeIndex,
      path: await proofFor(accumulator, own.treeIndex),
      freedSlotAccount: own.prevFree !== U32_MAX ? byIndex.get(own.prevFree)?.address : undefined,
      nextNeighborAccount:
        own.nextFree !== U32_MAX ? byIndex.get(own.nextFree)?.address : undefined,
    };
  }
  if (!own && sub.freeHead !== U32_MAX) {
    // New staker pops the head slot; the freed node (and its successor, when
    // one exists) must ride as remaining accounts.
    const head = byIndex.get(sub.freeHead)!;
    return {
      index: sub.freeHead,
      path: await proofFor(accumulator, sub.freeHead),
      freedSlotAccount: head.address,
      nextNeighborAccount:
        head.nextFree !== U32_MAX ? byIndex.get(head.nextFree)?.address : undefined,
    };
  }
  // Plain paths: existing active slot (top-up) or bump-allocated nextIndex.
  const index = own ? own.treeIndex : sub.nextIndex;
  if (index < 0 || index >= size) {
    throw new Error(
      `TreeFull: index ${index} out of range for depth ${sub.depth} (pool at capacity)`,
    );
  }
  return { index, path: await proofFor(accumulator, index) };
}

/** Constant-time byte comparison. */
function bytesEqual(a: ReadonlyUint8Array, b: ReadonlyUint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
