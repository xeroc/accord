// appeal.test.ts — runnable self-check for the appeal ladder + cost math +
// AppealBond PDA seeds. Excluded from the build.
//   pnpm --filter @accord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPEAL_WINDOW_SECS,
  MAX_JURORS,
  appealBondSeeds,
  appealCost,
  canAppeal,
  panelSizeForRound,
} from "../../dist/methods/appeal.js";

test("panelSizeForRound: appeal ladder (J+1)·2^k − 1, capped at MAX_JURORS", () => {
  // J=3: round 0=3, 1=7, 2=15, 3=31, 4=63→cap 31
  assert.equal(panelSizeForRound(3, 0), 3);
  assert.equal(panelSizeForRound(3, 1), 7);
  assert.equal(panelSizeForRound(3, 2), 15);
  assert.equal(panelSizeForRound(3, 3), 31);
  assert.equal(panelSizeForRound(3, 4), 31); // capped
  // J=5: round 0=5, 1=11, 2=23, 3=47→31
  assert.equal(panelSizeForRound(5, 1), 11);
  assert.equal(panelSizeForRound(5, 3), 31);
  // round_idx >= 31 => null (overflow guard)
  assert.equal(panelSizeForRound(3, 31), null);
  assert.equal(panelSizeForRound(3, -1), null);
});

test("appealCost: fee_new = panel · fee_per_juror, bond = fee_new, total = 2·fee_new", () => {
  // J=3, fee=1000: appealing round 0 -> new round 1, panel 7
  const c = appealCost(3, 0, 1_000n);
  assert.ok(c);
  assert.equal(c!.newRound, 1);
  assert.equal(c!.panel, 7);
  assert.equal(c!.fee, 7_000n);
  assert.equal(c!.bond, 7_000n);
  assert.equal(c!.total, 14_000n);
  // second appeal: round 1 -> 2, panel 15
  const c2 = appealCost(3, 1, 1_000n);
  assert.equal(c2!.newRound, 2);
  assert.equal(c2!.panel, 15);
  assert.equal(c2!.total, 30_000n);
  // overflow path
  assert.equal(appealCost(3, 31, 1n), null);
});

test("canAppeal: currentRound < maxAppeals (lib.rs:1386)", () => {
  assert.equal(canAppeal(0, 3), true);
  assert.equal(canAppeal(2, 3), true);
  assert.equal(canAppeal(3, 3), false); // max_appeals reached
});

test("appealBondSeeds: [b'bond', dispute[32], round_idx_le4]", () => {
  const d = new Uint8Array(32).fill(0x44);
  const seeds = appealBondSeeds(d, 0);
  assert.equal(seeds.length, 3);
  assert.deepEqual(Array.from(seeds[0]!), [98, 111, 110, 100]); // "bond"
  assert.equal(seeds[1]!.length, 32);
  assert.equal(seeds[2]!.length, 4);
  assert.deepEqual(Array.from(seeds[2]!), [0, 0, 0, 0]);
  const s = appealBondSeeds(d, 0x01020304);
  assert.deepEqual(Array.from(s[2]!), [4, 3, 2, 1]);
  assert.throws(() => appealBondSeeds(d, -1), /InvalidRoundIdx/);
  assert.throws(() => appealBondSeeds(new Uint8Array(31), 0), /InvalidDispute/);
});

test("constants: MAX_JURORS + APPEAL_WINDOW_SECS (constants.rs)", () => {
  assert.equal(MAX_JURORS, 31);
  assert.equal(APPEAL_WINDOW_SECS, 259_200n); // 3 days in seconds
});
