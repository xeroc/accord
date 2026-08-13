/**
 * format.test.ts — unit tests for the Canon app's display helpers.
 *
 * Pure functions (no RPC, no React) — run via `node --import tsx --test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  shortenAddress,
  shortAddress,
  formatBigInt,
  formatWindow,
  timeRemaining,
  formatBps,
  formatHash,
  ITEM_STATE_LABELS,
} from "./format.js";
import { ItemState } from "@useaccord/canon";
import { CANON_ITEM_LIST_OFFSET } from "./fetch.js";

// --- shortenAddress ---

test("shortenAddress: standard truncation", () => {
  assert.equal(
    shortenAddress("So11111111111111111111111111111111111111112"),
    "So11…1112",
  );
});

test("shortenAddress: too short to truncate returns original", () => {
  assert.equal(shortenAddress("Short"), "Short");
});

test("shortenAddress: custom chars", () => {
  assert.equal(
    shortenAddress("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", 6),
    "Tokenk…3VQ5DA",
  );
});

// --- shortAddress ---

test("shortAddress: configurable head/tail", () => {
  assert.equal(
    shortAddress("cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed", 6, 4),
    "cordhV…yKed",
  );
});

test("shortAddress: short input unchanged", () => {
  assert.equal(shortAddress("AbCd"), "AbCd");
});

// --- formatBigInt ---

test("formatBigInt: USDC (6 decimals)", () => {
  assert.equal(formatBigInt(1_000_000n, 6), "1");
  assert.equal(formatBigInt(1_500_000n, 6), "1.500000");
  assert.equal(formatBigInt(1_234_567n, 6), "1.234567");
});

test("formatBigInt: maxFractionDigits truncates", () => {
  assert.equal(formatBigInt(1_234_567n, 6, 2), "1.23");
});

test("formatBigInt: zero fraction", () => {
  assert.equal(formatBigInt(5_000_000n, 6, 0), "5");
});

test("formatBigInt: handles zero", () => {
  assert.equal(formatBigInt(0n, 9), "0");
});

test("formatBigInt: handles negative", () => {
  assert.equal(formatBigInt(-1_500_000n, 6), "-1.500000");
});

// --- formatWindow ---

test("formatWindow: days", () => {
  assert.equal(formatWindow(604_800n), "7d");
  assert.equal(formatWindow(86_400n), "1d");
});

test("formatWindow: hours", () => {
  assert.equal(formatWindow(7_200n), "2h");
  assert.equal(formatWindow(3_600n), "1h");
});

test("formatWindow: minutes", () => {
  assert.equal(formatWindow(120n), "2m");
  assert.equal(formatWindow(60n), "1m");
});

test("formatWindow: seconds (non-round)", () => {
  assert.equal(formatWindow(45n), "45s");
});

// --- timeRemaining ---

test("timeRemaining: days + hours", () => {
  const future = Math.floor(Date.now() / 1000) + 2 * 86400 + 3 * 3600;
  assert.match(timeRemaining(future), /^2d 3h$/);
});

test("timeRemaining: hours + minutes", () => {
  const future = Math.floor(Date.now() / 1000) + 2 * 3600 + 30 * 60;
  assert.match(timeRemaining(future), /^2h 30m$/);
});

test("timeRemaining: expired", () => {
  const past = Math.floor(Date.now() / 1000) - 100;
  assert.equal(timeRemaining(past), "expired");
});

test("timeRemaining: null/undefined/zero returns empty", () => {
  assert.equal(timeRemaining(null), "");
  assert.equal(timeRemaining(undefined), "");
  assert.equal(timeRemaining(0), "");
});

// --- formatBps ---

test("formatBps: standard values", () => {
  assert.equal(formatBps(6666), "66.66%");
  assert.equal(formatBps(100), "1%");
  assert.equal(formatBps(50), "0.5%");
  assert.equal(formatBps(10000), "100%");
  assert.equal(formatBps(0), "0%");
});

test("formatBps: custom fraction digits", () => {
  assert.equal(formatBps(333, 1), "3.3%");
  assert.equal(formatBps(333, 0), "3%");
});

// --- formatHash ---

test("formatHash: truncated by default", () => {
  const hash = new Uint8Array(32).fill(0xab);
  const result = formatHash(hash);
  assert.match(result, /^abababab…ababab$/);
});

test("formatHash: full hex when truncate=false", () => {
  const hash = new Uint8Array(32).fill(0xab);
  const result = formatHash(hash, false);
  assert.equal(result.length, 64);
  assert.equal(result, "ab".repeat(32));
});

// --- ITEM_STATE_LABELS ---

test("ITEM_STATE_LABELS: covers all ItemState variants", () => {
  assert.equal(ITEM_STATE_LABELS[ItemState.Pending], "Pending");
  assert.equal(ITEM_STATE_LABELS[ItemState.Listed], "Listed");
  assert.equal(ITEM_STATE_LABELS[ItemState.Removed], "Removed");
  assert.equal(ITEM_STATE_LABELS[ItemState.WithdrawPending], "Withdraw pending");
  assert.equal(ITEM_STATE_LABELS[ItemState.Disputed], "Disputed");
});

// --- CANON_ITEM_LIST_OFFSET ---

test("CANON_ITEM_LIST_OFFSET: is 40n (8-byte disc + 32-byte account)", () => {
  assert.equal(CANON_ITEM_LIST_OFFSET, 40n);
});
