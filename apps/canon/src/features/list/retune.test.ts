// retune.test.ts — pure-logic tests for the authority's retuning flow
// (accord-gou8). Mirrors withdrawal.test.ts: no RPC, no React.
import { test } from "node:test";
import assert from "node:assert/strict";

import type { Address } from "@solana/kit";
import type { CanonList } from "@useaccord/canon";

import {
  canUpdateList,
  COURT_UPDATE_FIELDS,
  parseCourtUpdateValue,
  timelockSecondsLeft,
} from "./retune";
import { requireAddress } from "./createForm";

const AUTHORITY = "AuthXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" as Address;
const OTHER = "0therXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" as Address;

/** Minimal decoded CanonList the gating logic needs (structural). */
function listWith(authority: Address): Pick<CanonList, "authority"> {
  return { authority };
}

test("canUpdateList: only the governance key may retune", () => {

  assert.equal(canUpdateList(listWith(AUTHORITY), AUTHORITY), true);
  assert.equal(canUpdateList(listWith(AUTHORITY), OTHER), false);
  // No wallet connected ⇒ never.
  assert.equal(canUpdateList(listWith(AUTHORITY), null), false);
});

test("COURT_UPDATE_FIELDS: Authority/minJurySize/depth are never offered", () => {
  const kinds = COURT_UPDATE_FIELDS.map((f) => f.kind);
  assert.ok(!kinds.includes("Authority"), "Authority is forbidden on canon");
  // Immutable-on-Subaccord fields are not UpdatePayload variants at all —
  // the picker must not grow hand-rolled entries for them.
  assert.equal(kinds.length, 11);
});

test("parseCourtUpdateValue: u64 fields parse to bigint payloads", () => {
  assert.deepEqual(parseCourtUpdateValue("MinStake", "2000"), {
    __kind: "MinStake",
    fields: [2000n],
  });
  assert.deepEqual(parseCourtUpdateValue("FeePerJuror", "25"), {
    __kind: "FeePerJuror",
    fields: [25n],
  });
});

test("parseCourtUpdateValue: bounded ints enforce canon/accord caps", () => {
  assert.deepEqual(parseCourtUpdateValue("AlphaBps", "1500"), {
    __kind: "AlphaBps",
    fields: [1500],
  });
  assert.throws(() => parseCourtUpdateValue("AlphaBps", "10001"), /0–10000/);
  assert.throws(() => parseCourtUpdateValue("MaxDrawAttempts", "0"), /1–/);
});

test("parseCourtUpdateValue: zero review/commit/reveal window rejected (anti-brick mirror)", () => {
  assert.throws(() => parseCourtUpdateValue("ReviewWindow", "0"), /> 0/);
  assert.throws(() => parseCourtUpdateValue("CommitWindow", "0"), /> 0/);
  assert.throws(() => parseCourtUpdateValue("RevealWindow", "0"), /> 0/);
  // A valid window parses.
  assert.deepEqual(parseCourtUpdateValue("ReviewWindow", "86400"), {
    __kind: "ReviewWindow",
    fields: [86400n],
  });
});

test("parseCourtUpdateValue: AppealWindow enforces Accord's 1h floor", () => {
  assert.throws(() => parseCourtUpdateValue("AppealWindow", "59"), /3600/);
  assert.deepEqual(parseCourtUpdateValue("AppealWindow", "3600"), {
    __kind: "AppealWindow",
    fields: [3600n],
  });
});

test("parseCourtUpdateValue: RevealThresholdBps allowed at 0 (Plurality pools)", () => {
  // Canon pools are pinned Plurality — the Median >0 gate never applies.
  assert.deepEqual(parseCourtUpdateValue("RevealThresholdBps", "0"), {
    __kind: "RevealThresholdBps",
    fields: [0],
  });
  assert.throws(() => parseCourtUpdateValue("RevealThresholdBps", "10001"), /0–10000/);
});

test("parseCourtUpdateValue: EvidenceOperator takes an address", () => {
  const addr = requireAddress(
    "9a1KmQpXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "operator",
  );
  assert.deepEqual(parseCourtUpdateValue("EvidenceOperator", addr), {
    __kind: "EvidenceOperator",
    fields: [addr],
  });
});

test("timelockSecondsLeft: ~400ms per slot, clamps past-deadline to negative", () => {
  assert.equal(timelockSecondsLeft(1000n, 900n), 40);
  assert.equal(timelockSecondsLeft(900n, 1000n), -40);
});
