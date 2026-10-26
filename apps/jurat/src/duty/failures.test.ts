// failures.test.ts — unit contract for the duty failure path (bean
// accord-5mpb): every failure source maps to abstain + alert, no default
// vote ever. Abstention in v1 is the absence of a vote — there is no
// on-chain abstain instruction — so this module's only powers are local
// state marking and the notification channel; structurally it cannot vote.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/jurat test
import { test } from "node:test";
import assert from "node:assert/strict";

import { FAILURE_KINDS, type DutyRecord, type DutyStore } from "./types.ts";
import { abstain } from "./failures.ts";

const DISPUTE = "Disp111111111111111111111111111111111111111";

function makeStore(seed?: DutyRecord) {
  const records = new Map<string, DutyRecord>();
  if (seed) records.set(`${seed.dispute}:${seed.roundIdx}`, seed);
  const store: DutyStore = {
    load: async (dispute, roundIdx) => records.get(`${dispute}:${roundIdx}`),
    save: async (record) => {
      records.set(`${record.dispute}:${record.roundIdx}`, record);
    },
  };
  return { store, records };
}

function makeDeps(seed?: DutyRecord) {
  const { store, records } = makeStore(seed);
  const notified: string[] = [];
  const deps = {
    store,
    notify: async (msg: string) => {
      notified.push(msg);
    },
    now: () => 1_234,
  };
  return { deps, records, notified };
}

const ref = { dispute: DISPUTE, roundIdx: 0 };

// --- the AC: every failure source maps to abstain + alert -------------------

test("every failure kind marks the duty abstained and fires one alert", async () => {
  assert.ok(FAILURE_KINDS.length >= 1);
  for (const kind of FAILURE_KINDS) {
    const { deps, notified } = makeDeps();
    const record = await abstain(deps, ref, kind, `boom (${kind})`);

    assert.equal(record.status, "abstained", kind);
    assert.equal(record.failure?.kind, kind);
    assert.equal(record.failure?.reason, `boom (${kind})`);
    assert.equal(record.failure?.at, 1_234);
    assert.match(notified[0]!, new RegExp(kind));
    assert.match(notified[0]!, /Disp1111/);
    assert.match(notified[0]!, /boom/);
    assert.match(notified[0]!, /abstain/i);
  }
});

test("failure kinds cover the v1 pipeline: evidence, ladder, verdict, window, salt, redraw", () => {
  assert.deepEqual(
    [...FAILURE_KINDS],
    [
      "evidence-unavailable",
      "retry-ladder-exhausted",
      "malformed-verdict",
      "window-closed",
      "salt-lost",
      "redrawn-out",
    ],
  );
});

// --- persistence vs alert ordering -------------------------------------------

test("abstention is persisted before alerting — alert failure cannot lose the mark", async () => {
  const { deps, records } = makeDeps();
  deps.notify = async () => {
    throw new Error("telegram down");
  };
  await assert.rejects(
    () => abstain(deps, ref, "retry-ladder-exhausted", "no endpoint"),
    /telegram down/,
  );
  assert.equal(records.get(`${DISPUTE}:0`)?.status, "abstained");
});

test("missing duty record is synthesized as abstained (pipeline may die before tracking)", async () => {
  const { deps, records } = makeDeps(); // no seed
  const record = await abstain(deps, ref, "malformed-verdict", "schema miss");
  assert.equal(record.status, "abstained");
  assert.equal(records.get(`${DISPUTE}:0`)?.failure?.kind, "malformed-verdict");
});

// --- lifecycle guards ----------------------------------------------------------

test("existing duty fields survive the abstain write (extend-in-place)", async () => {
  const seed: DutyRecord = {
    dispute: DISPUTE,
    roundIdx: 0,
    status: "open",
    failure: undefined,
    updatedAt: 100,
    drawnAt: 50,
  } as DutyRecord;
  const { deps, records } = makeDeps(seed);
  const record = await abstain(deps, ref, "window-closed", "too late");
  assert.equal(record.drawnAt, 50);
  assert.equal(records.get(`${DISPUTE}:0`)?.drawnAt, 50);
});

test("re-abstain updates the failure (newest wins) and alerts again", async () => {
  const { deps, notified } = makeDeps();
  await abstain(deps, ref, "evidence-unavailable", "daemon 502");
  await abstain(deps, ref, "window-closed", "missed the window");
  assert.equal(notified.length, 2);
  assert.match(notified[1]!, /window-closed/);
});

test("a revealed duty ignores a stale abstain — the vote already landed", async () => {
  const seed: DutyRecord = {
    dispute: DISPUTE,
    roundIdx: 0,
    status: "revealed",
    failure: undefined,
    updatedAt: 100,
  };
  const { deps, records, notified } = makeDeps(seed);
  const record = await abstain(deps, ref, "salt-lost", "late alert");
  assert.equal(record.status, "revealed");
  assert.equal(record.failure, undefined);
  assert.equal(records.get(`${DISPUTE}:0`)?.status, "revealed");
  assert.equal(notified.length, 0);
});
