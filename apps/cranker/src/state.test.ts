/**
 * state.test.ts — pure unit tests for resolveNextAction (bean accord-rnel).
 *
 * Covers each dispute-state branch + the time-window boundaries (before/at/after
 * reveal_end, appeal_window, and the cancel grace). No chain, no I/O.
 */
import { test, expect } from "bun:test";
import { address } from "@solana/kit";
import {
  Aggregation,
  DisputeState,
  ShortfallPolicy,
  type Dispute,
  type Round,
} from "@useaccord/sdk";

import { resolveNextAction } from "./state.js";

const ADDR = address("11111111111111111111111111111111");
const Z32 = new Uint8Array(32);
const DISCRIM = new Uint8Array(8);

/** 3 days, in seconds — the pre-draw timeout and post-draw grace (constants.rs). */
const THREE_DAYS = 259_200n;
const APPEAL_WINDOW = 100n;
const REVEAL_END = 10_000n;

function dispute(over: Partial<Dispute> & Pick<Dispute, "state"> = {} as never): Dispute {
  return {
    discriminator: DISCRIM,
    subaccord: ADDR,
    filer: ADDR,
    nonce: 0n,
    numOptions: 2,
    options: [Z32, Z32],
    evidenceHashes: [Z32, Z32, Z32, Z32],
    currentRound: 0,
    terms: {
      alphaBps: 1_000,
      minStake: 1_000n,
      feePerJuror: 0n,
      reviewWindow: 0n,
      commitWindow: 0n,
      revealWindow: 0n,
      appealWindow: APPEAL_WINDOW,
      maxAppeals: 3,
      minJurySize: 3,
      aggregation: Aggregation.Plurality,
      revealThresholdBps: 6_666,
      shortfallPolicy: ShortfallPolicy.Redraw,
      maxDrawAttempts: 3,
    },
    finalRuling: 255,
    finalizedAt: 0n,
    feePaid: 0n,
    committedVrf: { __option: "None" },
    frozenRoot: Z32,
    frozenTotalStake: 0n,
    filedAt: 0n,
    bump: 0,
    ...over,
  };
}

function round(over: Partial<Round> = {}): Round {
  return {
    discriminator: DISCRIM,
    roundIdx: 0,
    jurorCount: 0,
    commitCount: 0,
    revealCount: 0,
    reviewEnd: 0n,
    commitEnd: 0n,
    revealEnd: REVEAL_END,
    result: 255,
    bump: 0,
    pad0: new Uint8Array(2),
    dispute: ADDR,
    jurors: new Array(31).fill(ADDR),
    commits: new Array(31).fill(Z32),
    reveals: new Uint8Array(31).fill(255),
    settled: 0,
    pad1: new Uint8Array(4),
    seatPrefix: new Array(31).fill(0n),
    seatStake: new Array(31).fill(0n),
    drawAttempt: 0,
    padDrawAttempt: new Uint8Array(4),
    ...over,
  };
}

const SOME_VRF = { __option: "Some" as const, value: Z32 };

test("Created without VRF → request_vrf", () => {
  expect(resolveNextAction(dispute({ state: DisputeState.Created }), null, 1n)).toEqual({
    kind: "request_vrf",
  });
});

test("Created without VRF past the pre-draw timeout → cancel_dispute", () => {
  const filedAt = 1_000n;
  const d = dispute({ state: DisputeState.Created, filedAt });
  expect(resolveNextAction(d, null, filedAt + THREE_DAYS + 1n)).toEqual({
    kind: "cancel_dispute",
  });
  // exactly at the timeout boundary is NOT yet cancelable (now > deadline)
  expect(resolveNextAction(d, null, filedAt + THREE_DAYS)).toEqual({ kind: "request_vrf" });
});

test("Created with VRF, panel not yet full → draw_seat for the next seat", () => {
  // round-1 panel = 3 (panelSizeForRound(0)); 0 drawn, round absent → seat 0.
  expect(
    resolveNextAction(dispute({ state: DisputeState.Created, committedVrf: SOME_VRF }), null, 1n),
  ).toEqual({ kind: "draw_seat", seat: 0 });

  expect(
    resolveNextAction(
      dispute({ state: DisputeState.Created, committedVrf: SOME_VRF }),
      round({ jurorCount: 2 }),
      1n,
    ),
  ).toEqual({ kind: "draw_seat", seat: 2 });
});

test("Created with VRF, panel full → null (last draw_seat advanced state)", () => {
  expect(
    resolveNextAction(
      dispute({ state: DisputeState.Created, committedVrf: SOME_VRF }),
      round({ jurorCount: 3 }),
      1n,
    ),
  ).toBeNull();
});

test("Voting phase before reveal_end → null (windows open)", () => {
  for (const s of [DisputeState.Drawn, DisputeState.Commit, DisputeState.Reveal]) {
    expect(resolveNextAction(dispute({ state: s }), round(), REVEAL_END - 1n)).toBeNull();
  }
});

test("Voting phase at/after reveal_end → finalize_round", () => {
  for (const s of [DisputeState.Drawn, DisputeState.Commit, DisputeState.Reveal]) {
    expect(resolveNextAction(dispute({ state: s }), round(), REVEAL_END)).toEqual({
      kind: "finalize_round",
    });
  }
});

test("Voting phase, all revealed before reveal_end → finalize_round (early resolve)", () => {
  for (const s of [DisputeState.Drawn, DisputeState.Commit, DisputeState.Reveal]) {
    expect(
      resolveNextAction(
        dispute({ state: s }),
        round({ jurorCount: 3, revealCount: 3 }),
        REVEAL_END - 1n,
      ),
    ).toEqual({ kind: "finalize_round" });
  }
  // Not all revealed yet, still before reveal_end → windows open.
  expect(
    resolveNextAction(
      dispute({ state: DisputeState.Reveal }),
      round({ jurorCount: 3, revealCount: 2 }),
      REVEAL_END - 1n,
    ),
  ).toBeNull();
  // Degenerate empty panel (0==0) must NOT early-finalize.
  expect(
    resolveNextAction(dispute({ state: DisputeState.Reveal }), round(), REVEAL_END - 1n),
  ).toBeNull();
});

test("Voting phase past the post-draw grace → cancel_dispute", () => {
  const d = dispute({ state: DisputeState.Drawn });
  const deadline = REVEAL_END + APPEAL_WINDOW + THREE_DAYS;
  expect(resolveNextAction(d, round(), deadline + 1n)).toEqual({ kind: "cancel_dispute" });
  // within grace, finalize still wins
  expect(resolveNextAction(d, round(), deadline)).toEqual({ kind: "finalize_round" });
});

test("RoundResolved within the appeal window → null (waiting on appeal)", () => {
  const d = dispute({ state: DisputeState.RoundResolved });
  expect(resolveNextAction(d, round(), REVEAL_END + APPEAL_WINDOW - 1n)).toBeNull();
});

test("RoundResolved at appeal close → finalize_dispute", () => {
  expect(
    resolveNextAction(
      dispute({ state: DisputeState.RoundResolved }),
      round(),
      REVEAL_END + APPEAL_WINDOW,
    ),
  ).toEqual({ kind: "finalize_dispute" });
});

test("RoundResolved past the post-draw grace → cancel_dispute", () => {
  const d = dispute({ state: DisputeState.RoundResolved });
  const deadline = REVEAL_END + APPEAL_WINDOW + THREE_DAYS;
  expect(resolveNextAction(d, round(), deadline + 1n)).toEqual({ kind: "cancel_dispute" });
});

test("RedrawEligible → redraw immediately", () => {
  expect(resolveNextAction(dispute({ state: DisputeState.RedrawEligible }), round(), 1n)).toEqual({
    kind: "redraw",
  });
});

test("Final with a prior unsettled round → settle_round(roundIdx)", () => {
  const d = dispute({ state: DisputeState.Final, currentRound: 2 });
  expect(resolveNextAction(d, round({ roundIdx: 0, settled: 0 }), 1n)).toEqual({
    kind: "settle_round",
    roundIdx: 0,
  });
  // round 1 (also prior, settled) is skipped
  expect(resolveNextAction(d, round({ roundIdx: 1, settled: 1 }), 1n)).toBeNull();
});

test("Final with the current (final) round → null (settled by finalize_dispute)", () => {
  const d = dispute({ state: DisputeState.Final, currentRound: 2 });
  expect(resolveNextAction(d, round({ roundIdx: 2, settled: 0 }), 1n)).toBeNull();
});

test("Final with no round → null", () => {
  expect(resolveNextAction(dispute({ state: DisputeState.Final }), null, 1n)).toBeNull();
});

test("Closed and Failed are terminal → null", () => {
  for (const s of [DisputeState.Closed, DisputeState.Failed]) {
    expect(resolveNextAction(dispute({ state: s }), round(), 1n)).toBeNull();
  }
});
