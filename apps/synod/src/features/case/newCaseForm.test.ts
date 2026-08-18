/**
 * newCaseForm.test.ts — pure-logic tests for the new-case form (accord-3rk5).
 *
 * Covers the on-chain open_case gates mirrored client-side: roster bounds +
 * distinctness, frozen-fee preview math (N·S > fee), Plurality gate, join
 * deadline. Pure functions (no RPC, no React) — run via `node --import tsx --test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { Aggregation } from "@useaccord/sdk";

import {
  MIN_PARTIES,
  MAX_PARTIES,
  validateRoster,
  feePreview,
  pluralityGate,
  deadlineFromHours,
} from "./newCaseForm.js";

const OPENER = "GhE5rtYAqYTBDfVbnWFFeNDWwBtBV3F3q2rGzKGtFrV8";

// --- validateRoster ---

test("validateRoster: one named party (total 2) is the minimum", () => {
  const named = ["So11111111111111111111111111111111111111112"];
  assert.deepEqual(validateRoster(OPENER, named), []);
});

test("validateRoster: six named parties (total 7) is the maximum", () => {
  const named = [
    "So11111111111111111111111111111111111111112",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "GhE5rtYAqYTBDfVbnWFFeNDWwBtBV3F3q2rGzKGtFrV9",
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "definitely-not-an-address",
  ];
  // 7 total — count is fine; only the malformed entry is reported
  const errs = validateRoster(OPENER, named);
  assert.equal(errs.length, 1);
  assert.match(errs[0]!, /not a valid address/);
});

test("validateRoster: total roster below MIN_PARTIES is rejected", () => {
  assert.equal(validateRoster(OPENER, []).length, 1);
});

test("validateRoster: more than MAX_PARTIES total is rejected", () => {
  const named = new Array(7).fill(
    "So11111111111111111111111111111111111111112",
  );
  // 7 named + opener = 8 total > 7 — count error (dupes reported too, so
  // assert the count error is among them)
  const errs = validateRoster(OPENER, named);
  assert.ok(
    errs.some((e) => e.includes(`2–${MAX_PARTIES}`)),
    `expected roster-size error in ${JSON.stringify(errs)}`,
  );
});

test("validateRoster: duplicate named party is rejected", () => {
  const dup = "So11111111111111111111111111111111111111112";
  const errs = validateRoster(OPENER, [dup, dup]);
  assert.ok(errs.some((e) => e.includes("Duplicate")), JSON.stringify(errs));
});

test("validateRoster: named party duplicating the opener is rejected", () => {
  const errs = validateRoster(OPENER, [OPENER]);
  assert.ok(errs.some((e) => e.includes("Duplicate")), JSON.stringify(errs));
});

// --- feePreview ---

test("feePreview: frozen fee = minJurySize · feePerJuror; pot = N·S", () => {
  const p = feePreview({ minJurySize: 3, feePerJuror: 100n }, 500n, 2);
  // 3 named + opener... namedCount=2 → partyCount 3
  assert.equal(p.partyCount, 3);
  assert.equal(p.frozenFee, 300n);
  assert.equal(p.pot, 1500n);
  assert.equal(p.netToWinner, 1200n);
  assert.equal(p.coversFee, true);
});

test("feePreview: pot exactly equal to fee does NOT cover (strict >)", () => {
  const p = feePreview({ minJurySize: 3, feePerJuror: 100n }, 100n, 2);
  // pot = 3·100 = fee = 300 → coversFee false
  assert.equal(p.coversFee, false);
  assert.equal(p.netToWinner, 0n);
});

test("feePreview: pot below fee flagged", () => {
  const p = feePreview({ minJurySize: 3, feePerJuror: 100n }, 50n, 2);
  assert.equal(p.coversFee, false);
  assert.ok(p.netToWinner < 0n);
});

test("feePreview: zero stake never covers", () => {
  const p = feePreview({ minJurySize: 3, feePerJuror: 1n }, 0n, 1);
  assert.equal(p.coversFee, false);
});

// --- pluralityGate ---

test("pluralityGate: Plurality passes", () => {
  assert.equal(pluralityGate(Aggregation.Plurality), null);
});

test("pluralityGate: Median is rejected with a message", () => {
  assert.match(pluralityGate(Aggregation.Median)!, /Median/);
});

// --- deadlineFromHours ---

test("deadlineFromHours: now + hours in unix seconds", () => {
  const now = Date.UTC(2026, 7, 18, 12, 0, 0); // 2026-08-18T12:00:00Z
  assert.equal(deadlineFromHours(now, 3), BigInt(now / 1000 + 3 * 3600));
});

test("deadlineFromHours: non-positive hours → null", () => {
  assert.equal(deadlineFromHours(1_000_000, 0), null);
  assert.equal(deadlineFromHours(1_000_000, -5), null);
});

// --- constants ---

test("roster bounds: 2..=7 total parties", () => {
  assert.equal(MIN_PARTIES, 2);
  assert.equal(MAX_PARTIES, 7);
});
