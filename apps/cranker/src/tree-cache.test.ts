/**
 * tree-cache.test.ts — unit tests for the MST cache + frozen-root gate
 * (bean accord-gpo7).
 *
 * Fetchers are injected so the cache logic runs with no validator. The pure
 * {@link buildAccumulatorFromStakes} is tested against the SDK builder directly
 * (byte-exact root equality). The cache covers: hit-on-stable-root, rebuild on
 * root change, frozen-root match → accumulator, frozen-root mismatch → null +
 * warning log.
 */
import { test, expect } from "bun:test";
import { getAddressDecoder, getAddressEncoder, address, type Address } from "@solana/kit";
import { buildAccumulator, type LeafClaim } from "@useaccord/sdk";

import {
  buildAccumulatorFromStakes,
  TreeCache,
  type StakeLeaf,
  type SubaccordAccumulatorMeta,
} from "./tree-cache.js";

const DEPTH = 2; // 4-leaf tree — small but exercises sibling levels
const SUBACCORD = address("11111111111111111111111111111111");

/** Deterministic 32-byte pubkey from a small int. */
function addrBytes(n: number): Uint8Array {
  const b = new Uint8Array(32);
  b[31] = n;
  return b;
}
function addr(n: number): Address {
  return getAddressDecoder().decode(addrBytes(n)) as Address;
}

/** Canonical leaves the SDK builder + the cache must agree on. */
function leafClaims(stakes: StakeLeaf[]): LeafClaim[] {
  const size = 2 ** DEPTH;
  const out: LeafClaim[] = new Array(size);
  for (let i = 0; i < size; i++) out[i] = { juror: new Uint8Array(32), stake: 0n };
  const enc = getAddressEncoder();
  for (const s of stakes) {
    out[s.treeIndex] = { juror: new Uint8Array(enc.encode(s.juror)), stake: s.staked };
  }
  return out;
}

async function rootOf(stakes: StakeLeaf[]): Promise<Uint8Array> {
  const acc = await buildAccumulator(leafClaims(stakes), DEPTH);
  return acc.rootHash;
}

// --- buildAccumulatorFromStakes (pure) ---

test("rebuilds the same root as the SDK builder for matching leaves", async () => {
  const stakes: StakeLeaf[] = [
    { juror: addr(1), staked: 5_000n, treeIndex: 0 },
    { juror: addr(2), staked: 3_000n, treeIndex: 2 },
  ];
  const rebuilt = await buildAccumulatorFromStakes(stakes, DEPTH);
  const expected = await buildAccumulator(leafClaims(stakes), DEPTH);
  expect(rebuilt.rootHash).toEqual(expected.rootHash);
  expect(rebuilt.rootSum).toBe(8_000n);
});

test("empty pool → all-zero root", async () => {
  const rebuilt = await buildAccumulatorFromStakes([], DEPTH);
  const empty = await buildAccumulator(
    Array.from({ length: 2 ** DEPTH }, () => ({ juror: new Uint8Array(32), stake: 0n })),
    DEPTH,
  );
  expect(rebuilt.rootHash).toEqual(empty.rootHash);
});

test("throws on treeIndex out of range", async () => {
  expect(
    buildAccumulatorFromStakes([{ juror: addr(1), staked: 1n, treeIndex: 2 ** DEPTH }], DEPTH),
  ).rejects.toThrow(/InvalidTreeIndex/);
  expect(
    buildAccumulatorFromStakes([{ juror: addr(1), staked: 1n, treeIndex: -1 }], DEPTH),
  ).rejects.toThrow(/InvalidTreeIndex/);
});

// --- TreeCache cache invalidation ---

function makeCache(
  meta: SubaccordAccumulatorMeta,
  stakes: StakeLeaf[],
  log?: (msg: string, fields?: Record<string, unknown>) => void,
) {
  const metaCalls: Address[] = [];
  const stakeCalls: Address[] = [];
  const cache = new TreeCache({} as never, {
    fetchSubaccord: async (a) => {
      metaCalls.push(a);
      return meta;
    },
    fetchStakes: async (a) => {
      stakeCalls.push(a);
      return stakes;
    },
    log,
  });
  return { cache, metaCalls, stakeCalls };
}

test("second get() hits the cache — no second GPA when root is stable", async () => {
  const root = await rootOf([{ juror: addr(1), staked: 1_000n, treeIndex: 0 }]);
  const meta: SubaccordAccumulatorMeta = { rootHash: root, depth: DEPTH };
  const { cache, metaCalls, stakeCalls } = makeCache(meta, [
    { juror: addr(1), staked: 1_000n, treeIndex: 0 },
  ]);

  await cache.get(SUBACCORD);
  await cache.get(SUBACCORD);

  // subaccord probe runs twice (cheap root check), GPA runs once (cached).
  expect(metaCalls).toHaveLength(2);
  expect(stakeCalls).toHaveLength(1);
});

test("root change triggers a rebuild — GPA fires again", async () => {
  const root1 = await rootOf([{ juror: addr(1), staked: 1_000n, treeIndex: 0 }]);
  const stakes1: StakeLeaf[] = [{ juror: addr(1), staked: 1_000n, treeIndex: 0 }];
  const stakes2: StakeLeaf[] = [
    { juror: addr(1), staked: 1_000n, treeIndex: 0 },
    { juror: addr(2), staked: 2_000n, treeIndex: 1 },
  ];
  const root2 = await rootOf(stakes2);

  // Mutate the live meta + stakes between calls (simulating a new stake).
  let liveStakes = stakes1;
  const cache = new TreeCache({} as never, {
    fetchSubaccord: async () => ({
      rootHash: liveStakes === stakes1 ? root1 : root2,
      depth: DEPTH,
    }),
    fetchStakes: async () => liveStakes,
  });

  const first = await cache.get(SUBACCORD);
  expect(first.rootHash).toEqual(root1);

  liveStakes = stakes2;
  const second = await cache.get(SUBACCORD);
  expect(second.rootHash).toEqual(root2);
  expect(second.rootSum).toBe(3_000n);
});

// --- frozen-root gate ---

test("getVerifiedForDispute returns the accumulator when roots match", async () => {
  const stakes: StakeLeaf[] = [{ juror: addr(1), staked: 1_000n, treeIndex: 0 }];
  const root = await rootOf(stakes);
  const { cache } = makeCache({ rootHash: root, depth: DEPTH }, stakes);

  const result = await cache.getVerifiedForDispute({
    subaccord: SUBACCORD,
    frozenRoot: root,
  });
  expect(result).not.toBeNull();
  expect(result!.rootHash).toEqual(root);
});

test("getVerifiedForDispute returns null + logs on mismatch (juror withdrew post-freeze)", async () => {
  const stakes: StakeLeaf[] = [{ juror: addr(1), staked: 1_000n, treeIndex: 0 }];
  const liveRoot = await rootOf(stakes);
  const frozenRoot = await rootOf([
    { juror: addr(1), staked: 2_000n, treeIndex: 0 }, // different stake
  ]);
  const logs: string[] = [];
  const { cache } = makeCache({ rootHash: liveRoot, depth: DEPTH }, stakes, (msg, fields = {}) =>
    logs.push(JSON.stringify({ msg, ...fields })),
  );

  const result = await cache.getVerifiedForDispute({
    subaccord: SUBACCORD,
    frozenRoot: frozenRoot,
  });
  expect(result).toBeNull();
  expect(logs.some((l) => l.includes("frozen root mismatch"))).toBe(true);
});
