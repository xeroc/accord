/**
 * createForm.test.ts — checks the create-subaccord form logic extracted from
 * SubaccordCreatePage: defaults (pre-filled authority, random domain ref,
 * 4,096-seat pool), env-constant evidence operator, and arg building.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { Aggregation, DEFAULT_COHERENCE_TOL_BPS } from "@useaccord/sdk";

import {
  DEFAULT_POOL_DEPTH,
  EVIDENCE_OPERATOR,
  ZERO_ADDRESS,
  buildArgs,
  defaultFormState,
  randomHex32,
} from "./createForm";

const SIGNER =
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" as never;

test("defaultFormState: authority pre-filled with the signer pubkey", () => {
  const form = defaultFormState(SIGNER);
  assert.equal(form.authority, SIGNER);
});

test("defaultFormState: domain ref is a fresh 32-byte hex value", () => {
  const a = defaultFormState(SIGNER);
  assert.match(a.domainRef, /^[0-9a-f]{64}$/);
  const b = defaultFormState(SIGNER);
  assert.notEqual(a.domainRef, b.domainRef);
});

test("defaultFormState: pool capacity defaults to 4,096 seats (depth 12)", () => {
  assert.equal(DEFAULT_POOL_DEPTH, 12);
  assert.equal(defaultFormState(SIGNER).depth, "12");
});

test("randomHex32: 64 lowercase hex chars, non-repeating", () => {
  assert.match(randomHex32(), /^[0-9a-f]{64}$/);
  assert.notEqual(randomHex32(), randomHex32());
});

test("EVIDENCE_OPERATOR: env constant (unset in node → no operator)", () => {
  assert.equal(EVIDENCE_OPERATOR, ZERO_ADDRESS);
});

test("buildArgs: defaults produce a valid CreateSubaccordArgs", () => {
  const args = buildArgs({ ...defaultFormState(SIGNER), stakingToken: SIGNER, feeToken: SIGNER }, SIGNER);
  assert.equal(args.authority, SIGNER);
  assert.equal(args.evidenceOperator, EVIDENCE_OPERATOR);
  assert.equal(args.depth, 12);
  assert.equal(args.domainRef.length, 32);
});

test("buildArgs: aggregation=median maps to Aggregation.Median + coherence tol", () => {
  const form = { ...defaultFormState(SIGNER), stakingToken: SIGNER, feeToken: SIGNER };
  form.aggregation = "median";
  const args = buildArgs(form, SIGNER);
  assert.equal(args.aggregation, Aggregation.Median);
  assert.equal(args.coherenceTolBps, Number(DEFAULT_COHERENCE_TOL_BPS));
});

test("buildArgs: authority — explicit value wins, immutable → zero key", () => {
  const form = defaultFormState(SIGNER);
  form.stakingToken = form.feeToken = SIGNER;
  form.authority = "Another1PublicKey1111111111111111111111111111111";
  assert.equal(buildArgs(form, SIGNER).authority, form.authority);
  form.authority = "";
  assert.equal(buildArgs(form, SIGNER).authority, SIGNER);
  form.immutable = true;
  assert.equal(buildArgs(form, SIGNER).authority, ZERO_ADDRESS);
});

test("buildArgs: bad domain ref throws with the field label", () => {
  const form = defaultFormState(SIGNER);
  form.domainRef = "zz";
  assert.throws(() => buildArgs(form, SIGNER), /Domain Ref/);
});
