/**
 * executor.test.ts — join executor unit suite (bean accord-5pkj AC: "unit
 * tests with fake client"). Everything impure rides FakeChain; PDA
 * derivation, accumulator building, and membership verification use the real
 * SDK so the assertions pin on-chain-compatible semantics, not mocks.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AccountRole,
  address,
  getAddressEncoder,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  ACCORD_PROGRAM_ID,
  ShortfallPolicy,
  buildAccumulator,
  emptyRoot,
  findAccordStatePda,
  findAssociatedTokenAddress,
  findJurorStakePda,
  verifyMembership,
  type LeafClaim,
  type MSTNode,
  type StakingAccounts,
  type Subaccord,
} from "@useaccord/sdk";

import { joinSubaccord, type JoinBudget, type JoinChain, type JoinStakeRow } from "./executor.js";
import { loadBook, saveBook } from "./book.js";

// --- deterministic addresses -------------------------------------------------

/** `0…0X`-style addresses: leading zero bytes + one nonzero byte (valid 32B). */
const addr = (tail: string): Address => address("1".repeat(31) + tail);

const JUROR = addr("2");
const STAKING_TOKEN = addr("3");
const FEE_TOKEN = addr("4");
const SUBACCORD = addr("5");
const STAKER_A = addr("6"); // treeIndex 0 in populated pools
const STAKER_B = addr("7"); // treeIndex 1 in populated pools
/** Solana `Pubkey::default()` (32 zero bytes). */
const DEFAULT_PUBKEY = address("1".repeat(32));

const DEPTH = 2;
const U32_MAX = 0xffff_ffff;

// --- fixtures ----------------------------------------------------------------

/**
 * Rebuild the canonical accumulator and return (rootHash, rootSum), blanking
 * every JurorStake reachable from `freeHead` (their on-chain leaf is
 * `(default, 0)` — RECLAIM-LEAF). Mirrors what the chain stores.
 */
async function rootFor(
  stakes: readonly JoinStakeRow[],
  depth: number,
  freeHead: number,
): Promise<{ rootHash: Uint8Array; rootSum: bigint }> {
  const size = 2 ** depth;
  const leaves: LeafClaim[] = Array.from({ length: size }, () => ({
    juror: new Uint8Array(32),
    stake: 0n,
  }));
  for (const s of stakes) {
    leaves[s.treeIndex] = {
      juror: new Uint8Array(getAddressEncoder().encode(s.juror)),
      stake: s.staked,
    };
  }
  const byIndex = new Map(stakes.map((s) => [s.treeIndex, s] as const));
  let cur = freeHead;
  while (cur !== U32_MAX && byIndex.has(cur)) {
    leaves[cur] = { juror: new Uint8Array(32), stake: 0n };
    cur = byIndex.get(cur)!.nextFree;
  }
  const acc = await buildAccumulator(leaves, depth);
  return { rootHash: acc.rootHash, rootSum: acc.rootSum };
}

function stakeRow(
  juror: Address,
  treeIndex: number,
  staked: bigint,
  free: { prevFree?: number; nextFree?: number } = {},
): JoinStakeRow {
  return {
    address: addr(String(2 + treeIndex)),
    juror,
    staked,
    treeIndex,
    prevFree: free.prevFree ?? U32_MAX,
    nextFree: free.nextFree ?? U32_MAX,
  };
}

async function fakeSubaccord(
  stakes: readonly JoinStakeRow[] = [],
  overrides: Partial<Subaccord> = {},
): Promise<Subaccord> {
  const freeHead = overrides.freeHead ?? U32_MAX;
  const { rootHash, rootSum } = await rootFor(stakes, DEPTH, freeHead);
  return {
    discriminator: new Uint8Array(8),
    creator: STAKER_A,
    stakingToken: STAKING_TOKEN,
    feeToken: FEE_TOKEN,
    minStake: 100n,
    alphaBps: 1_000,
    reviewWindow: 604_800n,
    shortfallPolicy: ShortfallPolicy.Redraw,
    maxDrawAttempts: 2,
    coherenceTolBps: 0,
    authority: DEFAULT_PUBKEY,
    evidenceOperator: DEFAULT_PUBKEY,
    domainRef: new Uint8Array(32),
    evidenceSpec: new Uint8Array(32),
    jurorCredential: DEFAULT_PUBKEY,
    jurorSchema: DEFAULT_PUBKEY,
    stakerCount: stakes.filter((s) => s.staked > 0n).length,
    rootHash,
    totalStake: rootSum,
    nextIndex: stakes.length ? Math.max(...stakes.map((s) => s.treeIndex)) + 1 : 0,
    depth: DEPTH,
    feeVaultDeposited: 0n,
    feeVaultWithdrawn: 0n,
    stakeVaultDeposited: rootSum,
    stakeVaultWithdrawn: 0n,
    freeHead,
    bump: 255,
    padding: new Uint8Array(64),
    ...overrides,
  } as Subaccord;
}

const DEFAULT_BUDGET: JoinBudget = {
  globalStakeBudget: 1_000n,
  perSubaccordCap: 500n,
  reserveFloor: 50n,
  minSolLamports: 10_000n,
};

interface BuiltStakeInput {
  accounts: StakingAccounts;
  amount: bigint;
  path: MSTNode[];
  attestation?: Address;
}

/** Records every buildStake input; simulates the ledger on send. */
class FakeChain implements JoinChain {
  readonly programId = ACCORD_PROGRAM_ID;
  sub: Subaccord | null;
  stakes: JoinStakeRow[];
  token = 1_000n;
  sol = 1_000_000n;
  readonly sent: Instruction[] = [];
  readonly built: BuiltStakeInput[] = [];
  readonly staking = {
    buildStake: (input: BuiltStakeInput): Instruction => {
      this.built.push(input);
      return {
        programAddress: this.programId,
        data: new Uint8Array([9]),
        accounts: [],
      };
    },
  };
  /** What findAttestation returns (null = juror holds no matching credential). */
  attestation: Address | null = null;
  readonly attestQueries: { credential: Address; schema: Address; juror: Address }[] = [];

  async findAttestation(binding: { credential: Address; schema: Address; juror: Address }) {
    this.attestQueries.push(binding);
    return this.attestation;
  }

  constructor(sub: Subaccord | null, stakes: JoinStakeRow[] = []) {
    this.sub = sub;
    this.stakes = stakes;
  }

  async fetchSubaccord(): Promise<Subaccord | null> {
    return this.sub;
  }

  async fetchJurorStakes(): Promise<JoinStakeRow[]> {
    return this.stakes;
  }

  async tokenBalance(): Promise<bigint> {
    return this.token;
  }

  async solBalance(): Promise<bigint> {
    return this.sol;
  }

  async send(ix: Instruction): Promise<string> {
    this.sent.push(ix);
    // simulate the on-chain ledger effect of a successful stake
    const last = this.built[this.built.length - 1]!;
    const juror = last.accounts.juror;
    const amount = last.amount;
    const existing = this.stakes.find((s) => s.juror === juror);
    if (existing) {
      this.stakes = this.stakes.map((s) =>
        s.juror === juror
          ? {
              ...s,
              staked: s.staked + amount,
              prevFree: U32_MAX,
              nextFree: U32_MAX,
            }
          : s,
      );
    } else {
      const sub = this.sub!;
      const treeIndex = sub.freeHead !== U32_MAX ? sub.freeHead : sub.nextIndex;
      this.stakes = [...this.stakes, stakeRow(juror, treeIndex, amount)];
      this.sub = {
        ...sub,
        freeHead: U32_MAX,
        nextIndex: Math.max(sub.nextIndex, treeIndex + 1),
      };
    }
    this.token -= amount;
    return "sig" + this.sent.length;
  }
}

/** Seed one foreign book entry (budget test helper). */
async function seedBookEntry(stateDir: string, subaccord: Address, staked: bigint): Promise<void> {
  await saveBook(stateDir, {
    entries: [
      {
        subaccord,
        stakingToken: STAKING_TOKEN,
        staked,
        signature: "seed",
        joinedAt: "2026-10-15T00:00:00Z",
      },
    ],
  });
}

// --- the suite ----------------------------------------------------------------

describe("joinSubaccord", () => {
  let stateDir: string;

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "jurat-join-"));
  });

  async function cleanup() {
    await rm(stateDir, { recursive: true, force: true });
  }

  test("happy join on an empty pool: stakes, records the book", async () => {
    const chain = new FakeChain(await fakeSubaccord());
    const out = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });

    expect(out).toEqual({
      status: "joined",
      subaccord: SUBACCORD,
      amount: 100n,
      signature: "sig1",
    });
    expect(chain.sent).toHaveLength(1);

    // The instruction was built for the full canonical account set.
    const b = chain.built[0]!;
    expect(b.amount).toBe(100n);
    expect(b.attestation).toBeUndefined();
    expect(b.accounts.juror).toBe(JUROR);
    expect(b.accounts.subaccord).toBe(SUBACCORD);
    expect(b.accounts.stakingToken).toBe(STAKING_TOKEN);
    expect(b.accounts.jurorTokenAccount).toBe(
      await findAssociatedTokenAddress(STAKING_TOKEN, JUROR),
    );
    expect(b.accounts.stakeVault).toBe(await findAssociatedTokenAddress(STAKING_TOKEN, SUBACCORD));
    const [jurorStakePda] = await findJurorStakePda({
      subaccord: SUBACCORD,
      juror: JUROR,
    });
    expect(b.accounts.jurorStake).toBe(jurorStakePda);
    const [accordStatePda] = await findAccordStatePda();
    expect(b.accounts.accordState).toBe(accordStatePda);

    // The proof authenticates the NEXT free leaf (0) against the empty root.
    expect(b.path).toHaveLength(DEPTH);
    const root = await emptyRoot(DEPTH);
    const verify = await verifyMembership(
      { juror: new Uint8Array(32), stake: 0n },
      0,
      b.path,
      root,
      0n,
    );
    expect(verify.ok).toBe(true);

    // Book entry persisted with amount + signature.
    const book = await loadBook(stateDir);
    expect(book.entries).toHaveLength(1);
    expect(book.entries[0]!.subaccord).toBe(SUBACCORD);
    expect(book.entries[0]!.staked).toBe(100n);
    expect(book.entries[0]!.signature).toBe("sig1");
    await cleanup();
  });

  test("idempotent re-run: second call is already-joined, no second stake", async () => {
    const chain = new FakeChain(await fakeSubaccord());
    const first = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });
    expect(first.status).toBe("joined");

    const second = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });

    expect(second).toEqual({
      status: "already-joined",
      subaccord: SUBACCORD,
      staked: 100n,
    });
    expect(chain.sent).toHaveLength(1);
    expect((await loadBook(stateDir)).entries).toHaveLength(1);
    await cleanup();
  });

  test("crash recovery: on-chain stake without book entry reconciles the book", async () => {
    const alreadyStaked = [stakeRow(JUROR, 0, 100n)];
    const chain = new FakeChain(await fakeSubaccord(alreadyStaked), alreadyStaked);
    // (fresh stateDir, chain already shows the juror staked).
    const out = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });
    const book = await loadBook(stateDir);
    await cleanup();

    expect(out).toEqual({
      status: "already-joined",
      subaccord: SUBACCORD,
      staked: 100n,
    });
    expect(chain.sent).toHaveLength(0);
    expect(book.entries).toHaveLength(1);
    expect(book.entries[0]!.staked).toBe(100n);
  });

  test("throws InvalidAmount on a zero-minimum pool (no draw weight)", async () => {
    const chain = new FakeChain(await fakeSubaccord([], { minStake: 0n }));
    await expect(
      joinSubaccord(chain, {
        juror: JUROR,
        subaccord: SUBACCORD,
        budget: DEFAULT_BUDGET,
        stateDir,
      }),
    ).rejects.toThrow(/InvalidAmount/);
    await cleanup();
    expect(chain.sent).toHaveLength(0);
  });

  test("rejects OverSubaccordCap", async () => {
    const chain = new FakeChain(await fakeSubaccord());
    const out = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: { ...DEFAULT_BUDGET, perSubaccordCap: 99n }, // below the pool min 100n
      stateDir,
    });
    await cleanup();
    expect(out).toMatchObject({
      status: "rejected",
      reason: "OverSubaccordCap",
    });
    expect(chain.sent).toHaveLength(0);
  });

  test("rejects OverGlobalBudget against the book sum", async () => {
    // Book already carries 901n elsewhere; budget 1_000n, joining the min
    // 100n exceeds the 99n headroom.
    await seedBookEntry(stateDir, addr("9"), 901n);
    const chain = new FakeChain(await fakeSubaccord());
    const out = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });
    expect(out).toMatchObject({ status: "rejected", reason: "OverGlobalBudget" });
    expect(chain.sent).toHaveLength(0);
    expect((await loadBook(stateDir)).entries).toHaveLength(1);
    await cleanup();
  });

  test("rejects InsufficientTokenBalance below reserve floor", async () => {
    const chain = new FakeChain(await fakeSubaccord());
    chain.token = 100n + 50n - 1n; // amount + reserveFloor - 1
    const out = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });
    await cleanup();
    expect(out).toMatchObject({
      status: "rejected",
      reason: "InsufficientTokenBalance",
    });
    expect(chain.sent).toHaveLength(0);
  });

  test("rejects InsufficientSolBalance", async () => {
    const chain = new FakeChain(await fakeSubaccord());
    chain.sol = 9_999n;
    const out = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });
    await cleanup();
    expect(out).toMatchObject({
      status: "rejected",
      reason: "InsufficientSolBalance",
    });
    expect(chain.sent).toHaveLength(0);
  });

  test("rejects gated pools when no matching attestation is held (cannot join)", async () => {
    const chain = new FakeChain(
      await fakeSubaccord([], {
        jurorCredential: STAKER_A,
        jurorSchema: STAKER_B,
      }),
    );
    const out = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });
    await cleanup();
    expect(out).toMatchObject({ status: "rejected", reason: "AttestationGated" });
    expect(chain.sent).toHaveLength(0);
    expect(chain.attestQueries).toEqual([{ credential: STAKER_A, schema: STAKER_B, juror: JUROR }]);
  });

  test("already-joined gated pool short-circuits before the attestation lookup", async () => {
    const own = stakeRow(JUROR, 0, 100n);
    const chain = new FakeChain(
      await fakeSubaccord([own], {
        jurorCredential: STAKER_A,
        jurorSchema: STAKER_B,
      }),
      [own],
    );
    const out = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });
    await cleanup();
    expect(out).toMatchObject({ status: "already-joined", staked: 100n });
    expect(chain.attestQueries).toHaveLength(0);
    expect(chain.sent).toHaveLength(0);
  });
  test("joins gated pools when the SAS attestation is found, threading it into stake", async () => {
    const ATTESTATION = addr("9");
    const chain = new FakeChain(
      await fakeSubaccord([], {
        jurorCredential: STAKER_A,
        jurorSchema: STAKER_B,
      }),
    );
    chain.attestation = ATTESTATION;
    const out = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });
    await cleanup();
    expect(out).toMatchObject({ status: "joined", amount: 100n });
    expect(chain.built[0]!.attestation).toBe(ATTESTATION);
  });

  test("stake-only pools never query for an attestation", async () => {
    const chain = new FakeChain(await fakeSubaccord());
    await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });
    await cleanup();
    expect(chain.attestQueries).toHaveLength(0);
    expect(chain.built[0]!.attestation).toBeUndefined();
  });

  test("throws SubaccordNotFound", async () => {
    const chain = new FakeChain(null);
    await expect(
      joinSubaccord(chain, {
        juror: JUROR,
        subaccord: SUBACCORD,
        budget: DEFAULT_BUDGET,
        stateDir,
      }),
    ).rejects.toThrow(/SubaccordNotFound/);
    await cleanup();
  });

  test("throws on a stale accumulator root (no send, book untouched)", async () => {
    const fresh = await fakeSubaccord();
    const chain = new FakeChain({
      ...fresh,
      rootHash: new Uint8Array(32).fill(1),
    });
    await expect(
      joinSubaccord(chain, {
        juror: JUROR,
        subaccord: SUBACCORD,
        budget: DEFAULT_BUDGET,
        stateDir,
      }),
    ).rejects.toThrow(/AccumulatorRootMismatch/);
    expect(chain.sent).toHaveLength(0);
    expect((await loadBook(stateDir)).entries).toHaveLength(0);
    await cleanup();
  });

  test("new staker on a pool with a free list pops the head slot with neighbors", async () => {
    // A active at 0; B's drained slot 1 reclaimed → freeHead = 1.
    const a = stakeRow(STAKER_A, 0, 500n);
    const b = stakeRow(STAKER_B, 1, 0n);
    const stakes = [a, b];
    const chain = new FakeChain(await fakeSubaccord(stakes, { freeHead: 1 }), stakes);
    const out = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });
    await cleanup();

    expect(out).toMatchObject({ status: "joined", amount: 100n });

    // Proof authenticates the blank head slot (index 1), not nextIndex (2).
    const { rootHash, rootSum } = await rootFor([a, b], DEPTH, 1);
    const verify = await verifyMembership(
      { juror: new Uint8Array(32), stake: 0n },
      1,
      chain.built[0]!.path,
      rootHash,
      rootSum,
    );
    expect(verify.ok).toBe(true);

    // The freed head PDA rides as a writable remaining account.
    expect(chain.sent[0]!.accounts).toEqual([{ address: b.address, role: AccountRole.WRITABLE }]);
  });

  test("returning to a reclaimed own slot splices with predecessor neighbor", async () => {
    // Own juror's drained slot 2 reclaimed, mid-list after B's slot 1.
    const a = stakeRow(STAKER_A, 0, 500n);
    // B's reclaimed slot 1 heads the list and points at own's slot 2.
    const b = stakeRow(STAKER_B, 1, 0n, { nextFree: 2 });
    const own = { ...stakeRow(JUROR, 2, 0n), prevFree: 1, nextFree: U32_MAX };
    const stakes = [a, b, own];
    const chain = new FakeChain(await fakeSubaccord(stakes, { freeHead: 1 }), stakes);
    const out = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });
    await cleanup();

    expect(out).toMatchObject({ status: "joined", amount: 100n });

    // Proof authenticates own (blanked) slot 2.
    const { rootHash, rootSum } = await rootFor([a, b, own], DEPTH, 1);
    const verify = await verifyMembership(
      { juror: new Uint8Array(32), stake: 0n },
      2,
      chain.built[0]!.path,
      rootHash,
      rootSum,
    );
    expect(verify.ok).toBe(true);

    // Predecessor (B at slot 1) is the splice neighbor.
    expect(chain.sent[0]!.accounts).toEqual([{ address: b.address, role: AccountRole.WRITABLE }]);
  });

  test("drained top-up (own slot active, staked 0) stakes in place without neighbors", async () => {
    const own = stakeRow(JUROR, 0, 0n);
    const chain = new FakeChain(await fakeSubaccord([own]), [own]);
    const out = await joinSubaccord(chain, {
      juror: JUROR,
      subaccord: SUBACCORD,
      budget: DEFAULT_BUDGET,
      stateDir,
    });
    await cleanup();

    expect(out).toMatchObject({ status: "joined", amount: 100n });
    expect(chain.sent[0]!.accounts).toEqual([]);
  });
});
