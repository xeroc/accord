/**
 * format.test.ts — unit tests for the Synod dApp display helpers.
 *
 * Pure functions (no RPC, no React) — run via `node --import tsx --test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { shortenAddress, formatAmount } from "./format.js";

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
