/**
 * createForm.test.ts — checks the create-subaccord form logic extracted from
 * SubaccordCreatePage: defaults (pre-filled authority, template-prefilled
 * domain doc, 4,096-seat pool), env-constant evidence operator, doc→hash→args
 * (ADR-0027 amendment: domain_ref = sha256(doc)), and the publish state
 * machine (pending/published/failed→retry).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Aggregation,
  DEFAULT_COHERENCE_TOL_BPS,
  hashDomainDoc,
} from "@useaccord/sdk";
import { DOMAIN_DOC_TEMPLATE } from "@useaccord/ui";

import {
  DEFAULT_POOL_DEPTH,
  EVIDENCE_OPERATOR,
  ZERO_ADDRESS,
  buildArgs,
  defaultFormState,
  domainRefHex,
  nextPublish,
  type PublishState,
} from "./createForm";

const SIGNER = "9WzDXwBjmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" as never;

const IDENTITY_ARGS = (form: ReturnType<typeof defaultFormState>) => ({
  ...form,
  stakingToken: SIGNER,
  feeToken: SIGNER,
});

test("defaultFormState: authority pre-filled with the signer pubkey", () => {
  const form = defaultFormState(SIGNER);
  assert.equal(form.authority, SIGNER);
});

test("defaultFormState: author mode, template-prefilled doc, no random ref", () => {
  const a = defaultFormState(SIGNER);
  assert.equal(a.domainMode, "author");
  assert.equal(a.domainDoc, DOMAIN_DOC_TEMPLATE);
  assert.equal(a.domainRef, "");
  // deterministic — no randomHex32 (a random ref can never have a doc)
  assert.deepEqual(a, defaultFormState(SIGNER));
});

test("defaultFormState: pool capacity defaults to 4,096 seats (depth 12)", () => {
  assert.equal(DEFAULT_POOL_DEPTH, 12);
  assert.equal(defaultFormState(SIGNER).depth, "12");
});

test("EVIDENCE_OPERATOR: env constant (unset in node → no operator)", () => {
  assert.equal(EVIDENCE_OPERATOR, ZERO_ADDRESS);
});

test("doc→hash→args: author mode derives domain_ref = sha256(doc)", () => {
  const form = defaultFormState(SIGNER);
  form.domainDoc = "---\ntitle: Test rules\n---\n\nBody.";
  const hash = hashDomainDoc(new TextEncoder().encode(form.domainDoc));
  assert.equal(domainRefHex(form), hash);
  const args = buildArgs(IDENTITY_ARGS(form), SIGNER);
  // buildArgs passes the same 32 bytes as the on-chain domain_ref
  assert.deepEqual(
    args.domainRef,
    new Uint8Array(hash.match(/../g)!.map((h) => parseInt(h, 16))),
  );
});

test("reference mode: pasted hex is the domain_ref", () => {
  const form = defaultFormState(SIGNER);
  form.domainMode = "reference";
  form.domainRef = "ab".repeat(32);
  assert.equal(domainRefHex(form), "ab".repeat(32));
  assert.deepEqual(
    buildArgs(IDENTITY_ARGS(form), SIGNER).domainRef,
    new Uint8Array(32).fill(0xab),
  );
});

test("buildArgs: bad pasted hash throws with the field label", () => {
  const form = defaultFormState(SIGNER);
  form.domainMode = "reference";
  form.domainRef = "zz";
  assert.throws(() => buildArgs(IDENTITY_ARGS(form), SIGNER), /Domain Ref/);
});

test("buildArgs: defaults produce a valid CreateSubaccordArgs", () => {
  const args = buildArgs(IDENTITY_ARGS(defaultFormState(SIGNER)), SIGNER);
  assert.equal(args.authority, SIGNER);
  assert.equal(args.evidenceOperator, EVIDENCE_OPERATOR);
  assert.equal(args.depth, 12);
  assert.equal(args.domainRef.length, 32);
});

test("buildArgs: aggregation=median maps to Aggregation.Median + coherence tol", () => {
  const form = defaultFormState(SIGNER);
  form.aggregation = "median";
  const args = buildArgs(IDENTITY_ARGS(form), SIGNER);
  assert.equal(args.aggregation, Aggregation.Median);
  assert.equal(args.coherenceTolBps, Number(DEFAULT_COHERENCE_TOL_BPS));
});

test("buildArgs: authority — explicit value wins, immutable → zero key", () => {
  const form = defaultFormState(SIGNER);
  form.authority = "Another1PublicKey1111111111111111111111111111111";
  assert.equal(
    buildArgs(IDENTITY_ARGS(form), SIGNER).authority,
    form.authority,
  );
  form.authority = "";
  assert.equal(buildArgs(IDENTITY_ARGS(form), SIGNER).authority, SIGNER);
  form.immutable = true;
  assert.equal(buildArgs(IDENTITY_ARGS(form), SIGNER).authority, ZERO_ADDRESS);
});

// --- publish state machine ---------------------------------------------------

const idle: PublishState = { status: "idle" };

test("publish machine: idle → tx-confirmed → pending → published", () => {
  const pending = nextPublish(idle, { type: "tx-confirmed" });
  assert.equal(pending.status, "pending");
  const published = nextPublish(pending, { type: "published" });
  assert.equal(published.status, "published");
});

test("publish machine: pending → failed carries error; retry re-arms pending", () => {
  const pending = nextPublish(idle, { type: "tx-confirmed" });
  const failed = nextPublish(pending, {
    type: "failed",
    error: "daemon unreachable",
  });
  assert.deepEqual(failed, { status: "failed", error: "daemon unreachable" });
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
