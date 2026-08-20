/**
 * createForm.test.ts — unit tests for the create-list form logic (ADR-0027
 * amendment, create-first write path): template-prefilled doc defaults,
 * doc→hash→args (rules_hash = sha256(doc)), reference-mode paste validation,
 * and the post-confirm publish state machine.
 *
 * Uses node:test (Node ≥ 18 built-in). No framework deps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { hashDomainDoc } from "@useaccord/sdk";
import { defaultCourtParams } from "@useaccord/canon";
import { DOMAIN_DOC_TEMPLATE } from "@useaccord/ui";

import {
  DEFAULTS,
  buildArgs,
  buildCourt,
  docBytes,
  nextPublish,
  rulesHashHex,
  type FormState,
  type PublishState,
} from "./createForm";

const listProgram = "11111111111111111111111111111111";

const FILLED = () => ({
  ...DEFAULTS,
  stakeMint: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  feeMint: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  listProgram: "",
});

/** Form with court fields overridden — one place to tweak per-test. */
function court(overrides: Partial<FormState["court"]>): FormState {
  return { ...FILLED(), court: { ...DEFAULTS.court, ...overrides } };
}

test("defaults: author mode, template-prefilled doc, empty pasted hash", () => {
  assert.equal(DEFAULTS.domainMode, "author");
  assert.equal(DEFAULTS.rulesDoc, DOMAIN_DOC_TEMPLATE);
  assert.equal(DEFAULTS.rulesHash, "");
});

test("doc→hash→args: author mode derives rules_hash = sha256(doc)", () => {
  const form = FILLED();
  form.rulesDoc = "---\ntitle: Canon rules\n---\n\nBody.";
  const hash = hashDomainDoc(new TextEncoder().encode(form.rulesDoc));
  assert.equal(rulesHashHex(form), hash);
  const args = buildArgs(form);
  assert.deepEqual(
    args.rulesHash,
    new Uint8Array(hash.match(/../g)!.map((h) => parseInt(h, 16))),
  );
  assert.equal(args.listProgram, listProgram); // empty → system program
});

test("reference mode: pasted hex is the rules_hash", () => {
  const form = FILLED();
  form.domainMode = "reference";
  form.rulesHash = "cd".repeat(32);
  assert.equal(rulesHashHex(form), "cd".repeat(32));
  assert.deepEqual(buildArgs(form).rulesHash, new Uint8Array(32).fill(0xcd));
});

test("buildArgs: bad pasted hash throws with the field label", () => {
  const form = FILLED();
  form.domainMode = "reference";
  form.rulesHash = "nothex";
  assert.throws(() => buildArgs(form), /Rules hash/);
});

test("docBytes: UTF-8 bytes of the doc text", () => {
  const form = FILLED();
  form.rulesDoc = "règles";
  assert.deepEqual(docBytes(form), new TextEncoder().encode("règles"));
});

// --- court params (accord-qz7d / ADR canon/0002) -----------------------------

test("court defaults: string mirror of the SDK canonical profile", () => {
  const d = defaultCourtParams();
  assert.equal(DEFAULTS.court.minStake, d.minStake.toString());
  assert.equal(DEFAULTS.court.alphaBps, d.alphaBps.toString());
  assert.equal(DEFAULTS.court.reviewWindow, d.reviewWindow.toString());
  assert.equal(DEFAULTS.court.commitWindow, d.commitWindow.toString());
  assert.equal(DEFAULTS.court.revealWindow, d.revealWindow.toString());
  assert.equal(DEFAULTS.court.appealWindow, d.appealWindow.toString());
  assert.equal(DEFAULTS.court.maxAppeals, d.maxAppeals.toString());
  assert.equal(DEFAULTS.court.minJurySize, d.minJurySize.toString());
  assert.equal(DEFAULTS.court.feePerJuror, d.feePerJuror.toString());
  assert.equal(DEFAULTS.court.revealThresholdBps, d.revealThresholdBps.toString());
  assert.equal(DEFAULTS.court.maxDrawAttempts, d.maxDrawAttempts.toString());
  assert.equal(DEFAULTS.court.depth, d.depth.toString());
});

test("buildCourt: defaults land verbatim as CourtParams", () => {
  const p = buildCourt(FILLED());
  const d = defaultCourtParams();
  assert.deepEqual(p, d);
});

test("buildCourt: custom profile round-trips", () => {
  const p = buildCourt(
    court({ minStake: "250000", minJurySize: "5", maxAppeals: "1", alphaBps: "500" }),
  );
  assert.equal(p.minStake, 250_000n);
  assert.equal(p.minJurySize, 5);
  assert.equal(p.maxAppeals, 1);
  assert.equal(p.alphaBps, 500);
});

test("buildCourt: even jury size throws (Accord EvenJurySize mirror)", () => {
  assert.throws(() => buildCourt(court({ minJurySize: "4" })), /odd/);
});

test("buildCourt: appeal ladder overflow throws (LadderExceedsMaxJurors mirror)", () => {
  // (5+1)·2³−1 = 47 > MAX_JURORS (31)
  assert.throws(() => buildCourt(court({ minJurySize: "5", maxAppeals: "3" })), /ladder|MAX_JURORS/);
});

test("buildCourt: alpha over 10_000 throws (canon AlphaTooHigh mirror)", () => {
  assert.throws(() => buildCourt(court({ alphaBps: "10001" })), /Alpha/);
});

test("buildCourt: zero review/commit/reveal window throws (canon WindowTooShort mirror)", () => {
  assert.throws(() => buildCourt(court({ commitWindow: "0" })), /Commit window/);
  assert.throws(() => buildCourt(court({ reviewWindow: "0" })), /Review window/);
  assert.throws(() => buildCourt(court({ revealWindow: "0" })), /Reveal window/);
});

test("buildCourt: appeal window below the 1h floor throws (Accord floor mirror)", () => {
  assert.throws(() => buildCourt(court({ appealWindow: "3599" })), /Appeal window/);
});

test("buildCourt: depth over MAX_LIST_TREE_DEPTH throws (canon TreeDepthTooDeep mirror)", () => {
  assert.throws(() => buildCourt(court({ depth: "9" })), /depth/i);
});

test("buildCourt: reveal threshold + draw attempts bounds", () => {
  assert.throws(() => buildCourt(court({ revealThresholdBps: "10001" })), /Reveal threshold/);
  assert.throws(() => buildCourt(court({ maxDrawAttempts: "0" })), /Max draw attempts/);
  assert.throws(() => buildCourt(court({ maxDrawAttempts: "11" })), /Max draw attempts/);
});

// --- publish state machine ---------------------------------------------------

const idle: PublishState = { status: "idle" };

test("publish machine: idle → tx-confirmed → pending → published", () => {
  const pending = nextPublish(idle, { type: "tx-confirmed" });
  assert.equal(pending.status, "pending");
  assert.equal(nextPublish(pending, { type: "published" }).status, "published");
});

test("publish machine: pending → failed carries error; retry re-arms pending", () => {
  const pending = nextPublish(idle, { type: "tx-confirmed" });
  const failed = nextPublish(pending, { type: "failed", error: "daemon 404" });
  assert.deepEqual(failed, { status: "failed", error: "daemon 404" });
  const rePending = nextPublish(failed, { type: "retry" });
  assert.equal(rePending.status, "pending");
  assert.equal(
    nextPublish(rePending, { type: "published" }).status,
    "published",
  );
});

test("publish machine: invalid transitions are no-ops", () => {
  assert.deepEqual(nextPublish(idle, { type: "published" }), idle);
  assert.deepEqual(nextPublish(idle, { type: "retry" }), idle);
  const published = nextPublish(nextPublish(idle, { type: "tx-confirmed" }), {
    type: "published",
  });
  assert.deepEqual(nextPublish(published, { type: "retry" }), published);
  assert.deepEqual(
    nextPublish(published, { type: "failed", error: "x" }),
    published,
  );
});
