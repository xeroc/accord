// lifecycle.test.ts — runnable self-check for the Subaccord lifecycle helpers
// (PDA seeds, timelock constants, validation). Excluded from the build; run via:
//   pnpm --filter @useaccord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_APPEALS,
  MIN_APPEAL_WINDOW_SECS,
  UNPAUSE_TIMELOCK_SLOTS,
  UPDATE_TIMELOCK_SLOTS,
  assertValidAppealWindow,
  assertValidMaxAppeals,
  assertValidRiskType,
  canExecuteAt,
  accordStateSeeds,
  pendingUpdateSeeds,
  subaccordSeeds,
} from "./lifecycle.ts";
// Imports through ../types.ts — the public re-export surface. Guards REVIEW #12
// (DisputeState must be a value export, not type-only) at the line that broke.
import { DisputeState } from "../types.ts";

const ZERO32 = new Uint8Array(32);
const RISK = new Uint8Array(32).fill(0xab);
const CREATOR = new Uint8Array(32).fill(0x11);
const SUB = new Uint8Array(32).fill(0x22);

test("constants: timelocks match on-chain (constants.rs)", () => {
  assert.equal(UPDATE_TIMELOCK_SLOTS, 432_000n); // 48h @ 400ms/slot
  assert.equal(UNPAUSE_TIMELOCK_SLOTS, 216_000n); // 24h @ 400ms/slot
  assert.equal(MAX_APPEALS, 3);
});

test("subaccordSeeds: [b'subaccord', creator[32], risk_type[32]]", () => {
  const seeds = subaccordSeeds(CREATOR, RISK);
  assert.equal(seeds.length, 3);
  assert.deepEqual(
    Array.from(seeds[0]!),
    [115, 117, 98, 97, 99, 99, 111, 114, 100],
  ); // "subaccord"
  assert.equal(seeds[1]!.length, 32);
  assert.equal(seeds[2]!.length, 32);
  assert.deepEqual(Array.from(seeds[2]!), Array.from(RISK));
  // zero risk_type rejected
  assert.throws(() => subaccordSeeds(CREATOR, ZERO32), /InvalidRiskType/);
});

test("pendingUpdateSeeds: [b'update', subaccord[32], nonce_le8]", () => {
  const seeds = pendingUpdateSeeds(SUB, 0n);
  assert.equal(seeds.length, 3);
  assert.deepEqual(Array.from(seeds[0]!), [117, 112, 100, 97, 116, 101]); // "update"
  assert.equal(seeds[2]!.length, 8);
  assert.deepEqual(Array.from(seeds[2]!), [0, 0, 0, 0, 0, 0, 0, 0]);
  const s = pendingUpdateSeeds(SUB, 0x0102030405060708n);
  assert.deepEqual(Array.from(s[2]!), [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.throws(() => pendingUpdateSeeds(SUB, -1n), /InvalidNonce/);
  assert.throws(
    () => pendingUpdateSeeds(SUB, 0x10000000000000000n),
    /InvalidNonce/,
  );
});

test("accordStateSeeds: singleton [b'state']", () => {
  const seeds = accordStateSeeds();
  assert.equal(seeds.length, 1);
  assert.deepEqual(Array.from(seeds[0]!), [115, 116, 97, 116, 101]); // "state"
});

test("assertValidMaxAppeals: 0..=MAX_APPEALS", () => {
  assertValidMaxAppeals(0);
  assertValidMaxAppeals(MAX_APPEALS);
  assert.throws(() => assertValidMaxAppeals(MAX_APPEALS + 1), /MaxAppeals/);
  assert.throws(() => assertValidMaxAppeals(-1), /MaxAppeals/);
  assert.throws(() => assertValidMaxAppeals(1.5), /MaxAppeals/);
});

test("assertValidAppealWindow: >= MIN_APPEAL_WINDOW_SECS (ADR-0022)", () => {
  assertValidAppealWindow(MIN_APPEAL_WINDOW_SECS);
  assertValidAppealWindow(MIN_APPEAL_WINDOW_SECS * 100n);
  assert.throws(() => assertValidAppealWindow(0n), /AppealWindowTooShort/);
  assert.throws(
    () => assertValidAppealWindow(MIN_APPEAL_WINDOW_SECS - 1n),
    /AppealWindowTooShort/,
  );
});

test("assertValidRiskType: 32 bytes, non-zero", () => {
  assertValidRiskType(RISK);
  assert.throws(() => assertValidRiskType(ZERO32), /zero hash is reserved/);
  assert.throws(() => assertValidRiskType(new Uint8Array(31)), /32 bytes/);
});

test("canExecuteAt: slot >= execute_after_slot", () => {
  assert.equal(canExecuteAt(100n, 100n), true);
  assert.equal(canExecuteAt(100n, 101n), true);
  assert.equal(canExecuteAt(100n, 99n), false);
});

test("DisputeState is a runtime enum via the public root (REVIEW #12)", () => {
  // Regression: types.ts once re-exported it `type`-only, erasing the value and
  // breaking `dispute.state === DisputeState.Failed`. Must stay a value export.
  assert.equal(DisputeState.Created, 0);
  assert.equal(DisputeState.Drawn, 1);
  assert.equal(DisputeState.Failed, 8);
});
