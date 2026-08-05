// watermark.test.ts — runnable self-check for the Watermark no-op seam (v1).
//   bun test apps/evidence-daemon/tests/watermark.test.ts
//
// v1.1 (bean accord-1acp) replaces the pass-through with per-juror attribution
// and rewrites these expectations; here we pin the v1 contract: the seam is
// identity, independent of the juror, and length-preserving.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NoOpWatermark, type Watermark } from "../src/pipeline/watermark.ts";

const JUROR_A = new Uint8Array(32).fill(0xab);
const JUROR_B = new Uint8Array(32).fill(0xcd);

test("NoOpWatermark.apply is identity (pass-through == plaintext)", () => {
  const pt = new Uint8Array([1, 2, 3, 4, 5]);
  const out = NoOpWatermark.apply(pt, JUROR_A);
  assert.deepEqual(out, pt, "watermarked output must equal plaintext");
  assert.equal(out.length, pt.length, "length preserved");
});

test("NoOpWatermark is independent of the juror key", () => {
  const pt = new Uint8Array(64).fill(0x42);
  const a = NoOpWatermark.apply(pt, JUROR_A);
  const b = NoOpWatermark.apply(pt, JUROR_B);
  assert.deepEqual(b, a, "output must not depend on juror (no-op v1)");
});

test("NoOpWatermark round-trips empty plaintext", () => {
  const out = NoOpWatermark.apply(new Uint8Array(0), JUROR_A);
  assert.equal(out.length, 0, "empty in → empty out");
});

test("NoOpWatermark satisfies the Watermark trait", () => {
  const w: Watermark = NoOpWatermark;
  const pt = new Uint8Array([9, 9, 9]);
  assert.deepEqual(
    w.apply(pt, JUROR_A),
    pt,
    "trait-typed reference still identity",
  );
});
