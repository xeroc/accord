/**
 * case-seeds.test.ts — unit tests for SynodCase seed recovery (bean
 * accord-unja).
 *
 * `SynodCase` stores no seed backrefs (SPEC §Account model) but every synod
 * crank re-derives the case PDA from `["case", opener, nonce_le]` (seeds
 * constraint). The opener is `parties[0]`; the nonce is recovered by a bounded
 * local scan over `findCasePda` — no RPC. Recovery is cached per case
 * (positive AND negative — the nonce is immutable).
 */
import { test, expect } from "bun:test";
import { address } from "@solana/kit";
import { findCasePda } from "@useaccord/synod";

import { NONCE_SCAN_CAP, recoverCaseSeeds } from "./case-seeds.js";

const OPENER = address("11111111111111111111111111111112");
const OTHER = address("11111111111111111111111111111113");

test("recovers a small case-open nonce from the case PDA alone", async () => {
  const [pda] = await findCasePda({ opener: OPENER, nonce: 7n });
  const seeds = await recoverCaseSeeds(OPENER, pda, NONCE_SCAN_CAP);
  expect(seeds).toEqual({ opener: OPENER, nonce: 7n });
});

test("nonce 0 (the litesvm/e2e default) recovers on the first probe", async () => {
  const [pda] = await findCasePda({ opener: OPENER, nonce: 0n });
  expect(await recoverCaseSeeds(OPENER, pda, NONCE_SCAN_CAP)).toEqual({
    opener: OPENER,
    nonce: 0n,
  });
});

test("nonce at the cap boundary is found; beyond the cap is not", async () => {
  const cap = 8;
  const [atCap] = await findCasePda({ opener: OPENER, nonce: BigInt(cap - 1) });
  expect(await recoverCaseSeeds(OPENER, atCap, cap)).toEqual({
    opener: OPENER,
    nonce: BigInt(cap - 1),
  });
  const [beyond] = await findCasePda({ opener: OPENER, nonce: BigInt(cap) });
  expect(await recoverCaseSeeds(OPENER, beyond, cap)).toBeNull();
});

test("a PDA from a different opener never recovers (wrong seed component)", async () => {
  const [pda] = await findCasePda({ opener: OTHER, nonce: 3n });
  expect(await recoverCaseSeeds(OPENER, pda, 16)).toBeNull();
});

test("results are cached — a second lookup does not rescan", async () => {
  const [pda] = await findCasePda({ opener: OPENER, nonce: 2n });
  expect(await recoverCaseSeeds(OPENER, pda, NONCE_SCAN_CAP)).toEqual({
    opener: OPENER,
    nonce: 2n,
  });
  // Second call with a TINY cap still returns the cached hit — proof the scan
  // didn't rerun (a rescan with cap 1 would find nothing).
  expect(await recoverCaseSeeds(OPENER, pda, 1)).toEqual({
    opener: OPENER,
    nonce: 2n,
  });
});
