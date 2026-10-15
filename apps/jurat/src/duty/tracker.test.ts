// tracker.test.ts — unit contract for the duty tracker (bean accord-fgxw):
// seat detection in Round.jurors, chain-clock window math, redraw
// supersession (same round_idx, attempt+1), duplicate-scan idempotency.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/jurat test
import { test } from "node:test";
import assert from "node:assert/strict";

import { dutyPhase, roundWindows, trackRound, type RoundView } from "./tracker.ts";
import type { DutyRecord, DutyStore } from "./types.ts";

const DISPUTE = "Disp111111111111111111111111111111111111111";
const OUR_KEY = "Juror111111111111111111111111111111111111111";
const OTHER_A = "Other111111111111111111111111111111111111111";
const OTHER_B = "123111111111111111111111111111111111111111";

/** Panel windows [1000, 2000, 3000): review→commit→reveal. */
function round(overrides: Partial<RoundView> = {}): RoundView {
  return {
    dispute: DISPUTE,
    roundIdx: 0,
    drawAttempt: 0,
    jurorCount: 3,
    jurors: [OUR_KEY, OTHER_A, OTHER_B, OUR_KEY], // index 3 = dead slot
    // bigint ends — the decoded Round shape from the SDK.
    reviewEnd: 1_000n,
    commitEnd: 2_000n,
    revealEnd: 3_000n,
    ...overrides,
  };
}

function makeDeps(seed?: DutyRecord) {
  const records = new Map<string, DutyRecord>();
  if (seed) records.set(`${seed.dispute}:${seed.roundIdx}`, seed);
  let writes = 0;
  const store: DutyStore = {
    load: async (dispute, roundIdx) => records.get(`${dispute}:${roundIdx}`),
    save: async (record) => {
      writes += 1;
      records.set(`${record.dispute}:${record.roundIdx}`, record);
    },
  };
  const deps = { store, ourKey: OUR_KEY, now: () => 500 };
  return { deps, records, writeCount: () => writes };
}

test("dutyPhase: fully-committed panel reveals early (reveal.rs all_committed)", () => {
  const w = { reviewEnd: 1_000, commitEnd: 2_000, revealEnd: 3_000 };
  assert.equal(dutyPhase(w, 1_500, true), "reveal"); // early open
  assert.equal(dutyPhase(w, 1_500, false), "commit"); // same clock, panel open
  assert.equal(dutyPhase(w, 3_000, true), "final"); // upper bound unchanged
});

test("roundWindows normalizes decoded bigint ends to unix seconds", () => {
  const w = roundWindows(round());
  assert.deepEqual(w, { reviewEnd: 1_000, commitEnd: 2_000, revealEnd: 3_000 });
});

// --- seat detection -----------------------------------------------------------

test("drawn: fresh open duty with seat, attempt, and windows", async () => {
  const { deps, records, writeCount } = makeDeps()
  const record = await trackRound(deps, round());

  assert.equal(record.status, "open");
  assert.equal(record.seat, 0);
  assert.equal(record.drawAttempt, 0);
  assert.equal(record.reviewEnd, 1_000);
  assert.equal(record.commitEnd, 2_000);
  assert.equal(record.revealEnd, 3_000);
  assert.equal(writeCount(), 1);
  assert.equal(records.get(`${DISPUTE}:0`), record);
});

test("not drawn, no prior: null, nothing written", async () => {
  const { deps, writeCount } = makeDeps()
  const record = await trackRound(deps, round({ jurors: [OTHER_A, OTHER_B, OTHER_B] }));
  assert.equal(record, null);
  assert.equal(writeCount(), 0);
});

test("dead jury slot beyond jurorCount does not count as drawn", async () => {
  const { deps } = makeDeps();
  // Our key only at index 3 — beyond jurorCount 3 — with seat 2 live elsewhere.
  const record = await trackRound(
    deps,
    round({ jurorCount: 3, jurors: [OTHER_A, OTHER_B, OTHER_B, OUR_KEY] }),
  );
  assert.equal(record, null);
});

// --- duplicate idempotency ------------------------------------------------------

test("duplicate scan of the same attempt is a no-op: one write, progress intact", async () => {
  const { deps, writeCount } = makeDeps()
  const first = await trackRound(deps, round());
  const second = await trackRound(deps, round());
  assert.equal(second, first);
  assert.equal(writeCount(), 1);
});

test("committed/revealed/abstained progress is never clobbered by a rescan", async () => {
  for (const status of ["committed", "revealed", "abstained"] as const) {
    const seed: DutyRecord = {
      dispute: DISPUTE,
      roundIdx: 0,
      status,
      updatedAt: 100,
      seat: 0,
      drawAttempt: 0,
      reviewEnd: 1_000,
      commitEnd: 2_000,
      revealEnd: 3_000,
    };
    const { deps, writeCount } = makeDeps(seed)
    const record = await trackRound(deps, round());
    assert.equal(record?.status, status);
    assert.equal(writeCount(), 0);
  }
});

test("pre-tracking abstention (no drawAttempt) survives a scan untouched", async () => {
  const seed: DutyRecord = {
    dispute: DISPUTE,
    roundIdx: 0,
    status: "abstained",
    failure: { kind: "malformed-verdict", reason: "schema miss", at: 90 },
    updatedAt: 90,
  };
  const { deps, writeCount } = makeDeps(seed)
  const record = await trackRound(deps, round());
  assert.equal(record, seed);
  assert.equal(writeCount(), 0);
});

// --- redraw: same round_idx, attempt+1 ------------------------------------------

test("redraw with us drawn again: fresh duty supersedes the old record", async () => {
  const seed: DutyRecord = {
    dispute: DISPUTE,
    roundIdx: 0,
    status: "committed",
    updatedAt: 100,
    seat: 0,
    drawAttempt: 0,
    reviewEnd: 1_000,
    commitEnd: 2_000,
    revealEnd: 3_000,
  };
  const { deps, records } = makeDeps(seed);
  const redrawn = round({
    drawAttempt: 1,
    jurors: [OTHER_A, OUR_KEY, OTHER_B, OTHER_A], // new panel, new seat
    reviewEnd: 4_000n,
    commitEnd: 5_000n,
    revealEnd: 6_000n,
  });
  const record = await trackRound(deps, redrawn);

  assert.equal(record.status, "open"); // old commit is void — fresh duty
  assert.equal(record.drawAttempt, 1);
  assert.equal(record.seat, 1);
  assert.equal(record.reviewEnd, 4_000);
  assert.equal(records.get(`${DISPUTE}:0`), record);
});

test("redraw that drops us: stale record closed as redrawn-out, no fake open duty", async () => {
  const seed: DutyRecord = {
    dispute: DISPUTE,
    roundIdx: 0,
    status: "open",
    updatedAt: 100,
    seat: 0,
    drawAttempt: 0,
    reviewEnd: 1_000,
    commitEnd: 2_000,
    revealEnd: 3_000,
  };
  const { deps, records } = makeDeps(seed);
  const record = await trackRound(
    deps,
    round({ drawAttempt: 1, jurors: [OTHER_A, OTHER_B, OTHER_B, OUR_KEY] }),
  );

  assert.equal(record?.status, "abstained");
  assert.equal(record?.failure?.kind, "redrawn-out");
  assert.match(record?.failure?.reason ?? "", /attempt 1/);
  assert.equal(records.get(`${DISPUTE}:0`)?.status, "abstained");
});

test("not drawn with a same-attempt prior: prior returned untouched", async () => {
  const seed: DutyRecord = {
    dispute: DISPUTE,
    roundIdx: 0,
    status: "abstained",
    failure: { kind: "window-closed", reason: "late", at: 90 },
    updatedAt: 90,
    drawAttempt: 0,
  };
  const { deps, writeCount } = makeDeps(seed)
  const record = await trackRound(deps, round({ jurors: [OTHER_A, OTHER_B, OTHER_B] }));
  assert.equal(record, seed);
  assert.equal(writeCount(), 0);
});
