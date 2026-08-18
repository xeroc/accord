/**
 * caseDetail.test.ts — pure-logic tests for the case-detail view (accord-9aoc).
 *
 * Covers the milestone §6 test matrix: the resolveSynodAction state machine
 * (file / refund / claim gates), roster bitmasks, and the payout preview
 * mirroring on-chain `claim` (winner pot / neutral floor-share with remainder /
 * full-S Failed refund). Plus nonce recovery via pure PDA probing.
 *
 * Pure functions (no RPC, no React) — run via `node --import tsx --test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DisputeState } from "@useaccord/sdk";
import { CaseState, findCasePda } from "@useaccord/synod";
import { address } from "@solana/kit";

import {
  fullMask,
  joinedCount,
  bitSet,
  resolveCaseActions,
  payoutPreview,
  recoverCaseNonce,
} from "./caseDetail.js";

const OPENER = address("GhE5rtYAqYTBDfVbnWFFeNDWwBtBV3F3q2rGzKGtFrV8");

// --- roster masks ---

test("fullMask: 2..=7 party masks", () => {
  assert.equal(fullMask(2), 0b11);
  assert.equal(fullMask(3), 0b111);
  assert.equal(fullMask(7), 0b1111111);
});

test("joinedCount: popcount over the joined bitmask", () => {
  assert.equal(joinedCount(0b0000000), 0);
  assert.equal(joinedCount(0b0000101), 2);
  assert.equal(joinedCount(0b1111111), 7);
});

test("bitSet: per-party joined / paid-out reads", () => {
  assert.equal(bitSet(0b0100, 2), true);
  assert.equal(bitSet(0b0100, 1), false);
});

// --- resolveCaseActions (milestone §6 rows 1–3) ---

const NOW = 1_000_000n;

test("full roster joined + Opening → file action", () => {
  const a = resolveCaseActions(
    { state: CaseState.Opening, joined: fullMask(3), paidOut: 0, partyCount: 3, joinDeadline: NOW + 100n },
    null,
    NOW,
  );
  assert.deepEqual(a, { file: true, refund: false, claim: false });
});

test("deadline passed + incomplete roster → refund action", () => {
  const a = resolveCaseActions(
    { state: CaseState.Opening, joined: 0b001, paidOut: 0, partyCount: 3, joinDeadline: NOW - 1n },
    null,
    NOW,
  );
  assert.deepEqual(a, { file: false, refund: true, claim: false });
});

test("deadline NOT passed + incomplete roster → no action", () => {
  const a = resolveCaseActions(
    { state: CaseState.Opening, joined: 0b001, paidOut: 0, partyCount: 3, joinDeadline: NOW + 3600n },
    null,
    NOW,
  );
  assert.deepEqual(a, { file: false, refund: false, claim: false });
});

test("deadline passed but FULL roster → still files (early lock beats deadline)", () => {
  const a = resolveCaseActions(
    { state: CaseState.Opening, joined: fullMask(3), paidOut: 0, partyCount: 3, joinDeadline: NOW - 1n },
    null,
    NOW,
  );
  assert.deepEqual(a, { file: true, refund: false, claim: false });
});

test("Live + Final dispute → claim action; file/refund off", () => {
  const a = resolveCaseActions(
    { state: CaseState.Live, joined: fullMask(3), paidOut: 0, partyCount: 3, joinDeadline: 0n },
    DisputeState.Final,
    NOW,
  );
  assert.deepEqual(a, { file: false, refund: false, claim: true });
});

test("Live + Failed dispute → claim action", () => {
  const a = resolveCaseActions(
    { state: CaseState.Live, joined: fullMask(2), paidOut: 0, partyCount: 2, joinDeadline: 0n },
    DisputeState.Failed,
    NOW,
  );
  assert.deepEqual(a, { file: false, refund: false, claim: true });
});

test("Live + non-terminal dispute → no claim yet", () => {
  for (const s of [DisputeState.Created, DisputeState.Drawn, DisputeState.Review, DisputeState.Commit, DisputeState.Reveal]) {
    const a = resolveCaseActions(
      { state: CaseState.Live, joined: fullMask(3), paidOut: 0, partyCount: 3, joinDeadline: 0n },
      s,
      NOW,
    );
    assert.deepEqual(a, { file: false, refund: false, claim: false }, DisputeState[s]);
  }
});

test("Closed case → no actions", () => {
  const a = resolveCaseActions(
    { state: CaseState.Closed, joined: fullMask(3), paidOut: fullMask(3), partyCount: 3, joinDeadline: 0n },
    DisputeState.Final,
    NOW,
  );
  assert.deepEqual(a, { file: false, refund: false, claim: false });
});

// --- payoutPreview (mirrors on-chain claim) ---

test("payoutPreview: Final + party ruling → winner takes pot N·S − fee", () => {
  const p = payoutPreview(
    { partyCount: 3, stake: 1000n, fee: 300n },
    { state: DisputeState.Final, finalRuling: 1n },
  );
  assert.deepEqual(p, { kind: "winner", partyIndex: 1, amount: 2700n });
});

test("payoutPreview: Final + neutral ruling → floor share + remainder", () => {
  // 3·100 − 50 = 250; ⌊250/3⌋ = 83, remainder 1 (last claimant drains it)
  const p = payoutPreview(
    { partyCount: 3, stake: 100n, fee: 50n },
    { state: DisputeState.Final, finalRuling: 3n },
  );
  assert.deepEqual(p, { kind: "neutral", share: 83n, remainder: 1n });
});

test("payoutPreview: Failed dispute → every party pulls full S", () => {
  const p = payoutPreview(
    { partyCount: 3, stake: 100n, fee: 300n },
    { state: DisputeState.Failed, finalRuling: 255n },
  );
  assert.deepEqual(p, { kind: "failed", amount: 100n });
});

test("payoutPreview: non-terminal or missing dispute → pending", () => {
  assert.equal(
    payoutPreview({ partyCount: 3, stake: 100n, fee: 10n }, null)?.kind,
    "pending",
  );
  assert.equal(
    payoutPreview(
      { partyCount: 3, stake: 100n, fee: 10n },
      { state: DisputeState.Commit, finalRuling: 255n },
    )?.kind,
    "pending",
  );
});

// --- nonce recovery (pure PDA probe) ---

test("recoverCaseNonce: recovers the case seed from (opener, address)", async () => {
  const [pda] = await findCasePda({ opener: OPENER, nonce: 5n });
  assert.equal(await recoverCaseNonce(OPENER, pda), 5n);
});

test("recoverCaseNonce: nonce 0 recovered", async () => {
  const [pda] = await findCasePda({ opener: OPENER, nonce: 0n });
  assert.equal(await recoverCaseNonce(OPENER, pda), 0n);
});

test("recoverCaseNonce: foreign address → null within scan bound", async () => {
  const [pda] = await findCasePda({ opener: OPENER, nonce: 50_000n });
  assert.equal(await recoverCaseNonce(OPENER, pda, 1024), null);
});
