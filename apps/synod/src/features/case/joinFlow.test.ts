/**
 * joinFlow.test.ts — pure-logic tests for the join-with-evidence flow
 * (accord-o6nn; canon challengeFlow pattern adapted to synod keying).
 *
 * Covers the manifest wiring (synod ctx: dispute := case PDA, per-party
 * filer), the roster-derived option labels (neutral at party_count), editor
 * validation, and hash determinism of the committed bytes.
 *
 * Pure functions (no RPC, no React; no network) — run via
 * `node --import tsx --test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address } from "@solana/kit";
import { sha256 } from "@useaccord/sdk/evidence";

import {
  joinEvidenceErrors,
  synodOptionLabels,
  buildJoinManifest,
} from "./joinFlow.js";

const CASE = "CasePda1111111111111111111111111111111111111111" as Address;
const SUBACCORD =
  "SubPda11111111111111111111111111111111111111111111" as Address;
const PARTY =
  "GhE5rtYAqYTBDfVbnWFFeNDWwBtBV3F3q2rGzKGtFrV8" as Address;
const ROSTER = [
  PARTY,
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
] as const;

// --- synodOptionLabels --------------------------------------------------------

test("synodOptionLabels: one label per party, neutral last", () => {
  const labels = synodOptionLabels(ROSTER, 3);
  assert.equal(labels.length, 4);
  assert.equal(labels[3], "No party prevails");
  assert.equal(labels[0], "GhE5…FrV8"); // roster addresses are shortened
});

test("synodOptionLabels: long addresses are shortened", () => {
  const labels = synodOptionLabels(ROSTER, 3);
  assert.match(labels[1]!, /^9WzD…AWWM$/);
});

test("synodOptionLabels: padding slots never label", () => {
  // fixed-length roster with zero-pubkey tail, partyCount 2
  const labels = synodOptionLabels(
    [ROSTER[0], ROSTER[1], "11111111111111111111111111111111"],
    2,
  );
  assert.equal(labels.length, 3);
});

// --- joinEvidenceErrors -------------------------------------------------------

test("joinEvidenceErrors: title + at least one entry required", () => {
  assert.deepEqual(
    joinEvidenceErrors({ title: "Claim", description: "", entries: ["https://x"] }),
    [],
  );
  assert.deepEqual(joinEvidenceErrors({ title: "", description: "", entries: ["https://x"] }).length, 1);
  assert.deepEqual(
    joinEvidenceErrors({ title: "Claim", description: "", entries: ["", "   "] }).length,
    1,
  );
});

// --- buildJoinManifest --------------------------------------------------------

test("buildJoinManifest: synod keying — dispute IS the case PDA, filer is the party", () => {
  const buf = buildJoinManifest(
    {
      title: "Breach of the delivery deadline",
      description: "Party 1 never shipped.",
      entries: ["https://example.com/proof"],
    },
    {
      casePda: CASE,
      subaccord: SUBACCORD,
      filer: PARTY,
      filedAt: "2026-08-19T12:00:00Z",
      roster: ROSTER,
      partyCount: 3,
    },
    new Uint8Array(32), // deterministic salt
  );
  const yaml = new TextDecoder().decode(buf);
  assert.ok(yaml.includes(`dispute: ${CASE}`), yaml);
  assert.ok(yaml.includes(`subaccord: ${SUBACCORD}`), yaml);
  assert.ok(yaml.includes(`filer: ${PARTY}`), yaml);
  assert.ok(yaml.includes(`title: "Breach of the delivery deadline"`), yaml);
  assert.ok(yaml.includes("No party prevails"), yaml);
});

test("buildJoinManifest: same input → byte-identical manifest (hash determinism)", async () => {
  const ctx = {
    casePda: CASE,
    subaccord: SUBACCORD,
    filer: PARTY,
    filedAt: "2026-08-19T12:00:00Z",
    roster: ROSTER,
    partyCount: 3,
  };
  const input = {
    title: "Claim",
    description: "body",
    entries: ["https://example.com/a"],
  };
  const a = buildJoinManifest(input, ctx, new Uint8Array(32));
  const b = buildJoinManifest(input, ctx, new Uint8Array(32));
  assert.deepEqual(a, b);
  assert.deepEqual(await sha256(a), await sha256(b));
});

test("buildJoinManifest: different description → different bytes", () => {
  const ctx = {
    casePda: CASE,
    subaccord: SUBACCORD,
    filer: PARTY,
    filedAt: "2026-08-19T12:00:00Z",
    roster: ROSTER,
    partyCount: 3,
  };
  const a = buildJoinManifest(
    { title: "Claim", description: "one", entries: ["p"] },
    ctx,
    new Uint8Array(32),
  );
  const b = buildJoinManifest(
    { title: "Claim", description: "two", entries: ["p"] },
    ctx,
    new Uint8Array(32),
  );
  assert.notDeepEqual(a, b);
});
