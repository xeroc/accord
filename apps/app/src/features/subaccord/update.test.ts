// update.test.ts — pins the authority-gating predicate and the payload
// parser's domain bounds (accord-7s0n). Pure node tests, no React/RPC.
import { test } from "node:test";
import assert from "node:assert/strict";

import type { Address } from "@solana/kit";
import { Aggregation } from "@useaccord/sdk";

import {
  canUpdateSubaccord,
  parseUpdateValue,
  timelockSecondsLeft,
  UPDATE_FIELDS,
  ZERO_ADDRESS,
} from "./update.ts";

const AUTHORITY = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS" as Address;
const OTHER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" as Address;
const PLURALITY = Aggregation.Plurality;
const MEDIAN = Aggregation.Median;

// --- canUpdateSubaccord -----------------------------------------------------

test("canUpdateSubaccord: authority wallet => true", () => {
  assert.equal(
    canUpdateSubaccord({ authority: AUTHORITY }, AUTHORITY),
    true,
  );
});

test("canUpdateSubaccord: other wallet => false", () => {
  assert.equal(canUpdateSubaccord({ authority: AUTHORITY }, OTHER), false);
});

test("canUpdateSubaccord: no wallet => false", () => {
  assert.equal(canUpdateSubaccord({ authority: AUTHORITY }, null), false);
});

test("canUpdateSubaccord: immutable sentinel authority => false (even matching)", () => {
  // Pubkey::default() encodes as all-ones base58 in Kit views; the sentinel
  // can never be a real wallet, but the gate must not rely on that.
  assert.equal(canUpdateSubaccord({ authority: ZERO_ADDRESS }, ZERO_ADDRESS), false);
});

// --- parseUpdateValue: every kind parses ------------------------------------

test("UPDATE_FIELDS covers all 12 UpdatePayload kinds", () => {
  assert.equal(UPDATE_FIELDS.length, 12);
});

test("parseUpdateValue: bigint kinds", () => {
  assert.deepEqual(parseUpdateValue("MinStake", "2000", PLURALITY), {
    __kind: "MinStake",
    fields: [2000n],
  });
});

test("parseUpdateValue: bps/int kinds enforce bounds", () => {
  assert.deepEqual(parseUpdateValue("AlphaBps", "1500", PLURALITY), {
    __kind: "AlphaBps",
    fields: [1500],
  });
  assert.throws(() => parseUpdateValue("AlphaBps", "10001", PLURALITY));
  assert.throws(() => parseUpdateValue("MaxDrawAttempts", "0", PLURALITY));
  assert.throws(() => parseUpdateValue("MaxDrawAttempts", "11", PLURALITY));
  assert.deepEqual(parseUpdateValue("MaxDrawAttempts", "5", PLURALITY), {
    __kind: "MaxDrawAttempts",
    fields: [5],
  });
});

test("parseUpdateValue: AppealWindow enforces the ADR-0022 floor", () => {
  assert.throws(() => parseUpdateValue("AppealWindow", "3599", PLURALITY));
  assert.deepEqual(parseUpdateValue("AppealWindow", "3600", PLURALITY), {
    __kind: "AppealWindow",
    fields: [3600n],
  });
});

test("parseUpdateValue: address kinds", () => {
  assert.deepEqual(parseUpdateValue("Authority", AUTHORITY, PLURALITY), {
    __kind: "Authority",
    fields: [AUTHORITY],
  });
  assert.throws(() => parseUpdateValue("EvidenceOperator", "", PLURALITY));
});

// --- SR2-M-1 cross-field: Median requires reveal_threshold_bps > 0 ----------

test("parseUpdateValue: Median pool rejects RevealThresholdBps:0", () => {
  assert.throws(() => parseUpdateValue("RevealThresholdBps", "0", MEDIAN));
});

test("parseUpdateValue: Plurality pool accepts RevealThresholdBps:0", () => {
  assert.deepEqual(parseUpdateValue("RevealThresholdBps", "0", PLURALITY), {
    __kind: "RevealThresholdBps",
    fields: [0],
  });
});

test("parseUpdateValue: RevealThresholdBps caps at 10_000", () => {
  assert.throws(() => parseUpdateValue("RevealThresholdBps", "10001", PLURALITY));
});

// --- timelock estimate ------------------------------------------------------

test("timelockSecondsLeft: 432_000-slot delta ≈ 48h", () => {
  assert.equal(timelockSecondsLeft(432_000n, 0n), 172_800);
  assert.ok(timelockSecondsLeft(100n, 200n) <= 0); // elapsed
});
