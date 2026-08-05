// snapshot.test.ts — runnable self-check for the Merkle-Sum Tree builder,
// prover, sortition selector, and the verifyMstInclusion port. The MST is the
// backbone of ADR-0009 sortition; a byte-order or shape mistake silently breaks
// every draw, so the builder+prover are proven round-trip against the verifier
// (an independent code path mirroring lib.rs:1594) and pinned to a hardcoded
// root for a 2-leaf fixture.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @veridao/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMemberships,
  buildMst,
  proveMembership,
  selectSlot,
  snapshotSeeds,
  verifyMstInclusion,
} from "./snapshot.ts";

const toHex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

// 32-byte pubkey from a single leading byte (rest zero) — stable, sortable.
const pk = (first: number) => {
  const b = new Uint8Array(32);
  b[0] = first;
  return b;
};

// Known 2-leaf fixture (independent of snapshot.ts, computed with node:crypto):
//   A = {juror=0x01.., stake=100}, B = {juror=0x02.., stake=50}
//   sorted A,B; cum_after A=100, B=150; root = sha256(hA ‖ hB)
const KNOWN_ROOT =
  "c7ccca2da5c2a2eac51459bb712a0f5cfd34c9fac9b0dd85ecbaa4f6433d48ae";

test("buildMst: 2-leaf root matches independently computed known vector", async () => {
  const t = await buildMst([
    { juror: pk(2), stake: 50n }, // unsorted input on purpose
    { juror: pk(1), stake: 100n },
  ]);
  assert.equal(toHex(t.rootHash), KNOWN_ROOT);
  assert.equal(t.rootSum, 150n);
  assert.equal(t.leaves.length, 2); // already a power of two — no padding
  assert.equal(toHex(t.leaves[0]!.juror), toHex(pk(1))); // sorted ascending
  assert.equal(t.leaves[0]!.cumAfter, 100n);
  assert.equal(t.leaves[1]!.cumAfter, 150n);
});

test("buildMst + proveMembership + verifyMstInclusion: round-trips for every leaf, sizes 1..16", async () => {
  for (let n = 1; n <= 16; n++) {
    const jurors = Array.from({ length: n }, (_, i) => ({
      juror: pk(i + 1),
      stake: BigInt((i + 1) * 10),
    }));
    const t = await buildMst(jurors);
    // padded to next power of two; padding leaves carry zero stake
    const pow2 = 1 << Math.ceil(Math.log2(n));
    assert.equal(t.leaves.length, pow2, `n=${n} padding`);
    assert.equal(
      t.rootSum,
      jurors.reduce((a, j) => a + j.stake, 0n),
      `n=${n} sum`,
    );
    // every real leaf verifies
    for (let i = 0; i < n; i++) {
      const proof = proveMembership(t, i);
      const ok = await verifyMstInclusion(
        t.leaves[i]!,
        i,
        proof,
        t.rootHash,
        t.rootSum,
      );
      assert.ok(ok, `n=${n} leaf ${i} should verify`);
    }
  }
});

test("verifyMstInclusion: rejects tampered leaf / wrong root / wrong index", async () => {
  const t = await buildMst([
    { juror: pk(1), stake: 100n },
    { juror: pk(2), stake: 50n },
  ]);
  const proof0 = proveMembership(t, 0);
  // tampered stake
  const bad = { ...t.leaves[0]!, stake: 999n };
  const okBad = await verifyMstInclusion(bad, 0, proof0, t.rootHash, t.rootSum);
  assert.equal(okBad, false, "tampered leaf must fail");
  // wrong root
  const wrongRoot = new Uint8Array(32).fill(0xff);
  const okWrong = await verifyMstInclusion(
    t.leaves[0]!,
    0,
    proof0,
    wrongRoot,
    t.rootSum,
  );
  assert.equal(okWrong, false, "wrong root must fail");
  // swapped index (leaf 0 proven at index 1)
  const okSwap = await verifyMstInclusion(
    t.leaves[0]!,
    1,
    proof0,
    t.rootHash,
    t.rootSum,
  );
  assert.equal(okSwap, false, "wrong index must fail");
});

test("selectSlot: stake-weighted ranges [cum_before, cum_after)", async () => {
  const t = await buildMst([
    { juror: pk(1), stake: 100n }, // range [0,100)
    { juror: pk(2), stake: 50n }, //  range [100,150)
  ]);
  assert.equal(selectSlot(t, 0n), 0);
  assert.equal(selectSlot(t, 99n), 0);
  assert.equal(selectSlot(t, 100n), 1);
  assert.equal(selectSlot(t, 149n), 1);
  assert.throws(() => selectSlot(t, 150n), /SortitionOutOfRange/);
  assert.throws(() => selectSlot(t, -1n), /SortitionOutOfRange/);
});

test("buildMemberships: produces a verifying JurorMembership per slot", async () => {
  const jurors = [
    { juror: pk(1), stake: 30n },
    { juror: pk(2), stake: 10n },
    { juror: pk(3), stake: 60n }, // total 100
  ];
  const t = await buildMst(jurors);
  const slots = [5n, 35n, 99n]; // land in juror 1, 2, 3 respectively
  const mems = buildMemberships(t, slots);
  assert.equal(mems.length, 3);
  // distinct real jurors selected
  const keys = mems.map((m) => toHex(m.leaf.juror)).sort();
  assert.deepEqual(keys, [toHex(pk(1)), toHex(pk(2)), toHex(pk(3))].sort());
  // each verifies
  for (const m of mems) {
    const ok = await verifyMstInclusion(
      m.leaf,
      m.index,
      m.proof,
      t.rootHash,
      t.rootSum,
    );
    assert.ok(ok);
  }
});

test("buildMst: rejects empty set, duplicate juror, zero total stake", async () => {
  await assert.rejects(() => buildMst([]), /MstEmpty/);
  await assert.rejects(
    () =>
      buildMst([
        { juror: pk(1), stake: 10n },
        { juror: pk(1), stake: 20n },
      ]),
    /MstDuplicateJuror/,
  );
  await assert.rejects(
    () => buildMst([{ juror: pk(1), stake: 0n }]),
    /MstZeroStake/,
  );
});

test("snapshotSeeds: [b'snapshot', dispute[32], roundIdx_le4]", () => {
  const d = new Uint8Array(32).fill(0xab);
  const seeds = snapshotSeeds(d, 0);
  assert.equal(seeds.length, 3);
  assert.deepEqual(
    Array.from(seeds[0]!),
    [115, 110, 97, 112, 115, 104, 111, 116],
  );
  assert.equal(seeds[1]!.length, 32);
  assert.equal(seeds[2]!.length, 4);
  const s = snapshotSeeds(d, 0x01020304);
  assert.deepEqual(Array.from(s[2]!), [4, 3, 2, 1]);
  assert.throws(() => snapshotSeeds(d, -1), /InvalidRoundIdx/);
});
