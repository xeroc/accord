// disputePhase.test.ts — unit tests for the juror dashboard phase/countdown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { disputePhase, type RoundPhaseWindows } from "./disputePhase.ts";
import { DisputeState } from "../generated/types/disputeState.ts";

const NOW = 1_700_000_000n;

const ROUND: RoundPhaseWindows = {
  reviewEnd: NOW + 100n,
  commitEnd: NOW + 200n,
  revealEnd: NOW + 300n,
};

test("Review phase: countdown = reviewEnd - now", () => {
  const info = disputePhase(DisputeState.Review, NOW, ROUND);
  assert.equal(info.phase, "Review");
  assert.equal(info.countdownSecs, 100n);
});

test("Commit phase: countdown = commitEnd - now", () => {
  const info = disputePhase(DisputeState.Commit, NOW, ROUND);
  assert.equal(info.phase, "Commit");
  assert.equal(info.countdownSecs, 200n);
});

test("Reveal phase: countdown = revealEnd - now", () => {
  const info = disputePhase(DisputeState.Reveal, NOW, ROUND);
  assert.equal(info.phase, "Reveal");
  assert.equal(info.countdownSecs, 300n);
});

test("Past deadline: countdown goes negative (crank pending)", () => {
  const info = disputePhase(DisputeState.Review, NOW + 150n, ROUND);
  assert.equal(info.phase, "Review");
  assert.equal(info.countdownSecs, -50n);
});

test("Review/Commit/Reveal without round data: countdown is null", () => {
  for (const state of [
    DisputeState.Review,
    DisputeState.Commit,
    DisputeState.Reveal,
  ]) {
    const info = disputePhase(state, NOW, undefined);
    assert.equal(info.countdownSecs, null);
    assert.ok(info.phase.length > 0);
  }
});

test("Pre-draw states: no countdown", () => {
  assert.deepEqual(disputePhase(DisputeState.Created, NOW), {
    phase: "Pending draw",
    countdownSecs: null,
  });
  assert.deepEqual(disputePhase(DisputeState.Drawn, NOW), {
    phase: "Pending draw",
    countdownSecs: null,
  });
});

test("Post-vote states: no countdown", () => {
  const states: Array<[DisputeState, string]> = [
    [DisputeState.RoundResolved, "Awaiting appeal"],
    [DisputeState.Final, "Finalized"],
    [DisputeState.Closed, "Closed"],
    [DisputeState.Failed, "Failed"],
    [DisputeState.RedrawEligible, "Redraw eligible"],
  ];
  for (const [state, expected] of states) {
    const info = disputePhase(state, NOW);
    assert.equal(info.phase, expected);
    assert.equal(info.countdownSecs, null);
  }
});
