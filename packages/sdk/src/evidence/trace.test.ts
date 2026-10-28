// trace.test.ts — ADR-0037 trace batch signature self-check.
//
// Pins the canonical JSON form (recursive key sort, no whitespace,
// order-insensitive source) and the sign/verify contract shared by the jurat
// TraceSink (signs) and the daemon ingest pipeline (verifies): round-trip,
// tampered-field rejection, wrong-key rejection, malformed key/sig lengths.
import { test } from "node:test";
import { getBase58Decoder } from "@solana/kit";
import assert from "node:assert/strict";
import { ed25519 } from "@noble/curves/ed25519";

import {
  buildTraceBatchMessage,
  canonicalJson,
  verifyTraceBatchSig,
  type TraceBatchMessage,
} from "./trace.js";

const SEED = new Uint8Array(32).fill(7);
const PUB = ed25519.getPublicKey(SEED);
const JUROR = getBase58Decoder().decode(PUB);
const DISPUTE = "Disputexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

const BATCH = {
  v: 1 as const,
  juror: JUROR,
  dispute: DISPUTE,
  seq: 3,
  events: [{ type: "step", n: 1 }, { type: "verdict", optionIndex: 0 }],
};

function sign(b: TraceBatchMessage, seed: Uint8Array = SEED): Uint8Array {
  return ed25519.sign(buildTraceBatchMessage(b), seed);
}

test("canonicalJson sorts keys recursively and emits no whitespace", () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: [3, 1] } }), '{"a":{"c":[3,1],"d":4},"b":2}');
});

test("source key order does not change the canonical form", () => {
  assert.equal(canonicalJson({ seq: 1, v: 1 }), canonicalJson({ v: 1, seq: 1 }));
});

// Production regression (bean accord-r64v): every jurat batch carrying a
// step event 403'd with "signature does not verify for juror" — stepEvent
// passes ai@7's LanguageModelUsage through raw, and its normalization
// materializes optional fields as explicit `undefined` (e.g.
// inputTokenDetails.cacheWriteTokens). The sink signs the IN-MEMORY batch;
// the daemon re-canonicalizes the parsed wire body — canonicalJson must
// mirror JSON.stringify's undefined semantics exactly or the hashes desync.
const STEP_WITH_USAGE = {
  kind: "step",
  n: 1,
  toolCalls: [],
  usage: {
    inputTokens: 100,
    inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: undefined, noCacheTokens: 100 },
    outputTokens: 50,
    totalTokens: 150,
  },
};

test("canonicalJson mirrors JSON.stringify for undefined — entries skipped, array elements null", () => {
  assert.equal(canonicalJson({ a: 1, b: undefined }), '{"a":1}');
  assert.equal(canonicalJson([1, undefined]), "[1,null]");
});

test("canonicalJson is stable across the JSON wire round-trip", () => {
  const value = { seq: 4, events: [STEP_WITH_USAGE] };
  assert.equal(canonicalJson(value), canonicalJson(JSON.parse(JSON.stringify(value))));
});

test("a batch whose events carry explicit undefined verifies after the wire round-trip", () => {
  const batch: TraceBatchMessage = { ...BATCH, events: [STEP_WITH_USAGE] };
  const sig = sign(batch);
  const wire: TraceBatchMessage = { ...batch, events: JSON.parse(JSON.stringify(batch.events)) };
  assert.equal(verifyTraceBatchSig(PUB, wire, sig), true);
});

test("verifyTraceBatchSig round-trips a juror-signed batch", () => {
  assert.equal(verifyTraceBatchSig(PUB, BATCH, sign(BATCH)), true);
});

test("tampered fields do not verify", () => {
  const sig = sign(BATCH);
  assert.equal(verifyTraceBatchSig(PUB, { ...BATCH, seq: 4 }, sig), false);
  assert.equal(verifyTraceBatchSig(PUB, { ...BATCH, events: [{ type: "step", n: 2 }] }, sig), false);
  // Same content, different key order — canonical form is order-insensitive.
  assert.equal(verifyTraceBatchSig(PUB, { ...BATCH, juror: JUROR, seq: 3 }, sig), true);
});

test("a signature by a different key does not verify", () => {
  const otherSeed = new Uint8Array(32).fill(9);
  assert.equal(verifyTraceBatchSig(PUB, BATCH, sign(BATCH, otherSeed)), false);
});

test("malformed key/sig lengths return false", () => {
  assert.equal(verifyTraceBatchSig(new Uint8Array(31), BATCH, sign(BATCH)), false);
  assert.equal(verifyTraceBatchSig(PUB, BATCH, new Uint8Array(64)), false);
});
