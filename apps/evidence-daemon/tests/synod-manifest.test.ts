// synod-manifest.test.ts — assembled manifest GET pipeline (bean accord-lry5).
//   bun test apps/evidence-daemon/tests/synod-manifest.test.ts
//
// GET /evidence/synod/:case assembles the per-party bundles into one
// multi-bundle manifest (ADR-0017 payload per party + party field):
//   - pre-file: partial per-party view (slots without a bundle marked absent),
//     no `verified` flag;
//   - post-file: recompute H(case ‖ h_0…h_{N-1}) from the STORED bundles vs the
//     bound dispute's evidence_hashes[0] → verified true/false. A mismatch (or
//     a missing slot) ⇒ verified:false — the deliver bridge refuses assembly
//     on the same input.
//
// Identity-sha256 stub: the "root" is the literal concat preimage.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  synodManifest,
  type SynodManifestChain,
  type SynodManifestDeps,
  type SynodManifestStore,
} from "../src/pipeline/synod-manifest.ts";
import type { EvidenceBundle } from "../src/pipeline/ingest.ts";
import type { SynodCaseView } from "../src/pipeline/synod-ingest.ts";

// ---------------------------------------------------------------- helpers ----
function hex(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}

const CASE = new Uint8Array(32).fill(0x03);
const SUB = new Uint8Array(32).fill(0x01);
const DISPUTE = new Uint8Array(32).fill(0x07);
const ZERO_DISPUTE = new Uint8Array(32);

function partyBytes(i: number): Uint8Array {
  return new Uint8Array(32).fill(0xa0 + i);
}

function concatRoot(casePda: Uint8Array, hashes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(32 * (1 + hashes.length));
  out.set(casePda, 0);
  hashes.forEach((h, i) => out.set(h, 32 + i * 32));
  return out;
}

function slotBundle(slot: number): EvidenceBundle {
  return {
    subaccord: SUB,
    dispute: CASE,
    round: slot,
    ct: partyBytes(slot),
    claimant_ephem_pub: new Uint8Array(32).fill(0xcc),
    wrapped: new Uint8Array([9, 9]),
    plaintext_hash: partyBytes(slot),
    ingested_at: 100 + slot,
  };
}

function storeWith(bySlot: Map<number, EvidenceBundle>): SynodManifestStore {
  return {
    async get(sa, d, r) {
      if (hex(sa) !== hex(SUB) || hex(d) !== hex(CASE)) return null;
      return bySlot.get(r) ?? null;
    },
  };
}

function chain(parts: {
  caseView: SynodCaseView | null;
  disputeRoot?: Uint8Array | null;
}): SynodManifestChain {
  return {
    async readSynodCase(c) {
      if (parts.caseView === null || hex(c) !== hex(CASE)) return null;
      return parts.caseView;
    },
    async readDisputeRoot(d) {
      if (hex(d) !== hex(DISPUTE)) return null;
      return parts.disputeRoot ?? null;
    },
  };
}

/** Unbound 2-party case by default. */
function unboundCase(): SynodCaseView {
  return { subaccord: SUB, party_count: 2, dispute: ZERO_DISPUTE };
}

function deps(store: SynodManifestStore, ch: SynodManifestChain): SynodManifestDeps {
  return {
    store,
    chain: ch,
    sha256: async (data: Uint8Array) => data,
    decrypt: async (b: EvidenceBundle) => b.ct, // stub: ct is the manifest
  };
}

// =================================================================== TESTS ===

test("synod manifest: case not found → 404", async () => {
  const out = await synodManifest(CASE, deps(storeWith(new Map()), chain({ caseView: null })));
  assert.equal(out.status, 404);
});

test("synod manifest: pre-file partial view — absent slots marked, no verified flag", async () => {
  const out = await synodManifest(
    CASE,
    deps(storeWith(new Map([[0, slotBundle(0)]])), chain({ caseView: unboundCase() })),
  );
  assert.equal(out.status, 200);
  if (out.status !== 200) throw new Error("unreachable");
  assert.equal(out.body.verified, null, "no verified flag pre-file");
  assert.equal(out.body.party_count, 2);
  assert.deepEqual(
    out.body.parties.map((p) => p.present),
    [true, false],
    "slot 0 present, slot 1 absent",
  );
  const p0 = out.body.parties[0]!;
  if (!p0.present) throw new Error("unreachable");
  assert.equal(p0.party, 0);
  assert.equal(p0.ingested_at, 100);
});

test("synod manifest: post-file happy — recomputed root matches → verified:true", async () => {
  const out = await synodManifest(
    CASE,
    deps(
      storeWith(
        new Map([
          [0, slotBundle(0)],
          [1, slotBundle(1)],
        ]),
      ),
      chain({
        caseView: { ...unboundCase(), dispute: DISPUTE },
        disputeRoot: concatRoot(CASE, [partyBytes(0), partyBytes(1)]),
      }),
    ),
  );
  assert.equal(out.status, 200);
  if (out.status !== 200) throw new Error("unreachable");
  assert.equal(out.body.verified, true);
  assert.equal(out.body.parties.length, 2);
});

test("synod manifest: assembled hashes ≠ evidence_hashes[0] → verified:false", async () => {
  const out = await synodManifest(
    CASE,
    deps(
      storeWith(
        new Map([
          [0, slotBundle(0)],
          [1, slotBundle(1)],
        ]),
      ),
      chain({
        caseView: { ...unboundCase(), dispute: DISPUTE },
        // On-chain root built from different party-1 hash — swap detected.
        disputeRoot: concatRoot(CASE, [partyBytes(0), partyBytes(0)]),
      }),
    ),
  );
  assert.equal(out.status, 200);
  if (out.status !== 200) throw new Error("unreachable");
  assert.equal(out.body.verified, false);
});

test("synod manifest: post-file missing slot → verified:false (root not recomputable)", async () => {
  const out = await synodManifest(
    CASE,
    deps(
      storeWith(new Map([[0, slotBundle(0)]])), // slot 1 never pushed
      chain({
        caseView: { ...unboundCase(), dispute: DISPUTE },
        disputeRoot: concatRoot(CASE, [partyBytes(0), partyBytes(1)]),
      }),
    ),
  );
  assert.equal(out.status, 200);
  if (out.status !== 200) throw new Error("unreachable");
  assert.equal(out.body.verified, false);
});

test("synod manifest: bound dispute account missing on-chain → 404", async () => {
  const out = await synodManifest(
    CASE,
    deps(
      storeWith(new Map([[0, slotBundle(0)]])),
      chain({ caseView: { ...unboundCase(), dispute: DISPUTE }, disputeRoot: null }),
    ),
  );
  assert.equal(out.status, 404);
});
