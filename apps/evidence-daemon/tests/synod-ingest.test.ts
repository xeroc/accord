// synod-ingest.test.ts — pre-dispute grouping pipeline (bean accord-1viq,
// rewritten scope of accord-ybuq; milestone accord-daq8 HANDOFF §2).
//   bun test apps/evidence-daemon/tests/synod-ingest.test.ts
//
// POST /evidence/synod/:case/:party pushes are UNAUTHENTICATED by design: the
// on-chain per-party hash committed at `join` IS the commit; junk bundles fail
// the post-file root verification (sibling accord-lry5). The only chain gate
// here is the dispute-bound check: once `SynodCase.dispute` is bound
// (non-default), pushes are refused with 409.
//
// Matrix: happy / slot guard (>= party_count) / case 404 / dispute-bound 409 /
// idempotent re-put / different-hash conflict 409 / malformed bundle 400.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  synodIngest,
  type SynodCaseView,
  type SynodIngestChainReader,
  type SynodIngestStore,
} from "../src/pipeline/synod-ingest.ts";
import type { EvidenceBundle } from "../src/pipeline/ingest.ts";

// ---------------------------------------------------------------- helpers ----
function hex(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}

const CASE = new Uint8Array(32).fill(0x03);
const SUB = new Uint8Array(32).fill(0x01);
const HASH = new Uint8Array(32).fill(0xaa);
const OTHER_HASH = new Uint8Array(32).fill(0xbb);
const BOUND_DISPUTE = new Uint8Array(32).fill(0x07);

/** Unbound Opening case with a 3-party roster (max valid slot = 2). */
function caseView(overrides: Partial<SynodCaseView> = {}): SynodCaseView {
  return { subaccord: SUB, party_count: 3, dispute: new Uint8Array(32), ...overrides };
}

function bundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    subaccord: SUB,
    dispute: CASE,
    round: 0,
    ct: new Uint8Array([1, 2, 3, 4]),
    claimant_ephem_pub: new Uint8Array(32).fill(0xcc),
    wrapped: new Uint8Array([9, 9, 9]),
    plaintext_hash: HASH,
    ingested_at: 0,
    ...overrides,
  };
}

function memoryStore(): SynodIngestStore & { objects: Map<string, EvidenceBundle> } {
  const objects = new Map<string, EvidenceBundle>();
  const key = (s: Uint8Array, d: Uint8Array, r: number) => `${hex(s)}:${hex(d)}:${r}`;
  return {
    objects,
    async get(s, d, r) {
      return objects.get(key(s, d, r)) ?? null;
    },
    async put(b) {
      objects.set(key(b.subaccord, b.dispute, b.round), b);
    },
  };
}

function chain(view: SynodCaseView | null): SynodIngestChainReader {
  return {
    async readSynodCase(c) {
      if (hex(c) !== hex(CASE)) return null;
      return view;
    },
  };
}

// =================================================================== TESTS ===

test("synod ingest: happy → 201, stored grouped by case PDA + slot", async () => {
  const store = memoryStore();
  const out = await synodIngest(CASE, 2, bundle({ round: 2 }), {
    store,
    chain: chain(caseView()),
  });
  assert.equal(out.status, 201);
  if (out.status !== 201) throw new Error("unreachable");
  assert.equal(out.idempotent, false);
  // Grouping key: the case's subaccord + the CASE pda + the party slot.
  const stored = store.objects.get(`${hex(SUB)}:${hex(CASE)}:2`);
  assert.ok(stored, "bundle stored at {subaccord}/{case}/{slot}");
  assert.ok(stored && stored.ingested_at > 0, "ingested_at stamped server-side");
});

test("synod ingest: slot >= party_count → 400, nothing stored", async () => {
  const store = memoryStore();
  const out = await synodIngest(CASE, 3, bundle({ round: 3 }), {
    store,
    chain: chain(caseView()),
  });
  assert.equal(out.status, 400);
  if (out.status !== 400) throw new Error("unreachable");
  assert.match(out.reason, /slot/);
  assert.equal(store.objects.size, 0);
});

test("synod ingest: case not found on-chain → 404", async () => {
  const store = memoryStore();
  const out = await synodIngest(CASE, 0, bundle(), { store, chain: chain(null) });
  assert.equal(out.status, 404);
  assert.equal(store.objects.size, 0);
});

test("synod ingest: dispute already bound → 409 (post-file push refused)", async () => {
  const store = memoryStore();
  const out = await synodIngest(CASE, 0, bundle(), {
    store,
    chain: chain(caseView({ dispute: BOUND_DISPUTE })),
  });
  assert.equal(out.status, 409);
  if (out.status !== 409) throw new Error("unreachable");
  assert.match(out.reason, /dispute/);
  assert.equal(store.objects.size, 0);
});

test("synod ingest: same-hash re-put → 201 idempotent", async () => {
  const store = memoryStore();
  const d = { store, chain: chain(caseView()) };
  const first = await synodIngest(CASE, 1, bundle({ round: 1 }), d);
  assert.equal(first.status, 201);
  const second = await synodIngest(CASE, 1, bundle({ round: 1 }), d);
  assert.equal(second.status, 201);
  if (second.status !== 201) throw new Error("unreachable");
  assert.equal(second.idempotent, true);
  assert.equal(store.objects.size, 1);
});

test("synod ingest: different hash for same slot → 409 conflict", async () => {
  const store = memoryStore();
  const d = { store, chain: chain(caseView()) };
  await synodIngest(CASE, 1, bundle({ round: 1 }), d);
  const out = await synodIngest(CASE, 1, bundle({ round: 1, plaintext_hash: OTHER_HASH }), d);
  assert.equal(out.status, 409);
  assert.equal(store.objects.size, 1, "original bundle untouched");
});

test("synod ingest: malformed bundle → 400 (empty ct)", async () => {
  const store = memoryStore();
  const out = await synodIngest(CASE, 0, bundle({ ct: new Uint8Array(0) }), {
    store,
    chain: chain(caseView()),
  });
  assert.equal(out.status, 400);
  assert.equal(store.objects.size, 0);
});
