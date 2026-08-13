// appeal.test.ts — runnable self-check for the appeal ladder + cost math +
// AppealBond PDA seeds. Excluded from the build.
//   pnpm --filter @useaccord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_APPEAL_WINDOW_SECS,
  MAX_JURORS,
  appealBondSeeds,
  appealCost,
  canAppeal,
  panelSizeForRound,
} from "./appeal.ts";

test("panelSizeForRound: (J+1)·2^k − 1 ladder, capped at MAX_JURORS; base configurable (accord-9q3e)", () => {
  // Default base = 3 (INITIAL_NUM_JURORS): 0=3, 1=7, 2=15, 3=31.
  assert.equal(panelSizeForRound(0), 3);
  assert.equal(panelSizeForRound(1), 7);
  assert.equal(panelSizeForRound(2), 15);
  assert.equal(panelSizeForRound(3), 31);
  assert.equal(panelSizeForRound(4), 31); // capped
  // round_idx >= 31 => null (overflow guard)
  assert.equal(panelSizeForRound(31), null);
  assert.equal(panelSizeForRound(-1), null);
  // accord-9q3e: custom base. N=1 → round 0 = 1 (single juror).
  assert.equal(panelSizeForRound(0, 1), 1);
  assert.equal(panelSizeForRound(0, 5), 5);
  assert.equal(panelSizeForRound(1, 5), 11);
  assert.equal(panelSizeForRound(2, 5), 23);
  assert.equal(panelSizeForRound(1, 1), 3);
  // invalid base
  assert.equal(panelSizeForRound(0, 0), null);
  assert.equal(panelSizeForRound(0, -1), null);
});

test("appealCost: fee_new = panel · fee_per_juror, bond = fee_new, total = 2·fee_new", () => {
  // fee=1000: appealing round 0 -> new round 1, panel 7
  const c = appealCost(0, 1_000n);
  assert.ok(c);
  assert.equal(c!.newRound, 1);
  assert.equal(c!.panel, 7);
  assert.equal(c!.fee, 7_000n);
  assert.equal(c!.bond, 7_000n);
  assert.equal(c!.total, 14_000n);
  // second appeal: round 1 -> 2, panel 15
  const c2 = appealCost(1, 1_000n);
  assert.equal(c2!.newRound, 2);
  assert.equal(c2!.panel, 15);
  assert.equal(c2!.total, 30_000n);
  // overflow path
  assert.equal(appealCost(31, 1n), null);
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

test("constants: MAX_JURORS + DEFAULT_APPEAL_WINDOW_SECS (constants.rs)", () => {
  assert.equal(MAX_JURORS, 31);
  assert.equal(DEFAULT_APPEAL_WINDOW_SECS, 259_200n); // 3 days in seconds
});
