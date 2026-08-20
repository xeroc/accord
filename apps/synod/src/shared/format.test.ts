/**
 * format.test.ts — unit tests for the Synod dApp display helpers.
 *
 * Pure functions (no RPC, no React) — run via `node --import tsx --test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  shortenAddress,
  shortAddress,
  formatAmount,
  formatHash,
  formatWindow,
  timeRemaining,
  timeAgo,
} from "./format.js";

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

test("formatAmount: thousands separators over base units", () => {
  assert.equal(formatAmount(1500n), "1,500");
  assert.equal(formatAmount(1200n), "1,200");
  assert.equal(formatAmount(0n), "0");
});

test("shortAddress: explicit head/tail truncation", () => {
  assert.equal(
    shortAddress("So11111111111111111111111111111111111111112", 6, 3),
    "So1111…112",
  );
  assert.equal(shortAddress("Short"), "Short");
});

test("formatHash: 32-byte hash → truncated lowercase hex", () => {
  const bytes = new Uint8Array(32).fill(0xab);
  assert.equal(
    formatHash(bytes),
    `${"ab".repeat(4)}…${"ab".repeat(3)}`,
  );
  assert.equal(formatHash(bytes, false), "ab".repeat(32));
});

test("formatWindow: humanised durations", () => {
  assert.equal(formatWindow(86_400n), "1d");
  assert.equal(formatWindow(3_600n), "1h");
  assert.equal(formatWindow(60n), "1m");
  assert.equal(formatWindow(90n), "90s");
});

test("timeRemaining: countdown ladder", () => {
  const now = 1_000_000;
  assert.equal(timeRemaining(now + 2 * 86400 + 3 * 3600, now), "2d 3h");
  assert.equal(timeRemaining(now + 45 * 60, now), "45m");
  assert.equal(timeRemaining(now - 1, now), "expired");
  assert.equal(timeRemaining(null), "");
});

test("timeAgo: elapsed ladder", () => {
  const now = 1_000_000;
  assert.equal(timeAgo(now - 5 * 3600, now), "5h ago");
  assert.equal(timeAgo(now - 30, now), "just now");
  assert.equal(timeAgo(undefined), "");
});
