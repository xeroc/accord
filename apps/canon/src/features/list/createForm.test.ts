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
import { DOMAIN_DOC_TEMPLATE } from "@useaccord/ui";

import {
  DEFAULTS,
  buildArgs,
  docBytes,
  nextPublish,
  rulesHashHex,
  type PublishState,
} from "./createForm";

const listProgram = "11111111111111111111111111111111";

const FILLED = () => ({
  ...DEFAULTS,
  stakeMint: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  feeMint: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  listProgram: "",
});

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
