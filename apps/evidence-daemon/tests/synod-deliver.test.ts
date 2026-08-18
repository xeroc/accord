// synod-deliver.test.ts — juror deliver bridge (bean accord-g1dy; milestone
// accord-daq8 HANDOFF §4).
//   bun test apps/evidence-daemon/tests/synod-deliver.test.ts
//
// When `Dispute.filer` is a SynodCase PDA bound to that dispute
// (`case.dispute == dispute`), GET /evidence/:dispute/for/:juror serves the
// assembled pre-dispute GROUP instead of the per-round bundle: one package per
// party slot (`round` field = slot), gated by the file-time root
// H(case ‖ h_0…h_{N-1}) == evidence_hashes[0]. Root mismatch ⇒ 409 — juror
// assembly refused (bundle swap detected).
//
// Uses the identity-sha256 crypto stub (pipeline.test.ts pattern): the
// "digest" of the concatenated preimage IS the preimage, so the expected root
// is built literally in the test — pinning the wire layout independently of
// the helper under test.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deliver,
  type DeliverChainReader,
  type DeliverDeps,
  type DeliverStore,
} from "../src/pipeline/deliver.ts";
import { synodEvidenceRoot } from "../src/pipeline/synod-group.ts";
import type { EvidenceBundle } from "../src/pipeline/ingest.ts";
import type { SynodCaseView } from "../src/pipeline/synod-ingest.ts";

// ---------------------------------------------------------------- helpers ----
function hex(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}

const CASE = new Uint8Array(32).fill(0x03); // dispute.filer — the case PDA
const SUB = new Uint8Array(32).fill(0x01);
const DISPUTE = new Uint8Array(32).fill(0x07); // == case.dispute (bound)
const JUROR = new Uint8Array(32).fill(0x05);
const OP_SK = new Uint8Array(32).fill(0x99);
const NON_SYNOD_FILER = new Uint8Array(32).fill(0x0d);

/** Party i's committed hash / stub-plaintext (identity sha256: hash == bytes). */
function partyBytes(i: number): Uint8Array {
  return new Uint8Array(32).fill(0xa0 + i);
}

/** Concatenated preimage — the expected root under the identity digest. */
function concatRoot(casePda: Uint8Array, hashes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(32 * (1 + hashes.length));
  out.set(casePda, 0);
  hashes.forEach((h, i) => out.set(h, 32 + i * 32));
  return out;
}

function slotBundle(slot: number, plaintextHash = partyBytes(slot)): EvidenceBundle {
  return {
    subaccord: SUB,
    dispute: CASE, // group key: the case PDA, not the dispute
    round: slot,
    ct: plaintextHash, // stub plaintext == its committed hash
    claimant_ephem_pub: new Uint8Array(32).fill(0xcc),
    wrapped: new Uint8Array([9, 9]),
    plaintext_hash: plaintextHash,
    ingested_at: 0,
  };
}

/** Group store: (subaccord, case, slot) → bundle; null otherwise. */
function groupStore(bySlot: Map<number, EvidenceBundle>): DeliverStore {
  return {
    async get(sa, d, r) {
      if (hex(d) !== hex(CASE) || hex(sa) !== hex(SUB)) return null;
      return bySlot.get(r) ?? null;
    },
  };
}

function chain(parts: { filer: Uint8Array; synodCase: SynodCaseView | null }): DeliverChainReader {
  return {
    async readDispute(d) {
      if (hex(d) !== hex(DISPUTE)) return null;
      return {
        subaccord: SUB,
        filer: parts.filer,
        evidence_hashes: [parts.evidenceHash0],
        current_round: 0,
      };
    },
    async readSubaccord(sa) {
      return hex(sa) === hex(SUB) ? { evidence_operator: new Uint8Array(32).fill(0xee) } : null;
    },
    async readRound() {
      return { jurors: [JUROR] };
    },
    async readSynodCase(f) {
      if (parts.synodCase === null || hex(f) !== hex(CASE)) return null;
      return parts.synodCase;
    },
  };
}

function caseView(partyCount: number, dispute = DISPUTE): SynodCaseView {
  return { subaccord: SUB, party_count: partyCount, dispute };
}

/** Identity-digest crypto stub (see file header). */
function stubCrypto() {
  return {
    sha256: async (data: Uint8Array) => data,
    async unwrap(bundle: EvidenceBundle) {
      return { plaintext: bundle.ct };
    },
    async reencryptToJuror(wm: Uint8Array) {
      return { out: wm, operator_ephem_pub: new Uint8Array(32).fill(0xff) };
    },
  };
}

function deps(store: DeliverStore, ch: DeliverChainReader): DeliverDeps {
  return {
    store,
    chain: ch,
    keyring: {
      async forOperator() {
        return OP_SK;
      },
    },
    crypto: stubCrypto(),
  };
}

// ============================================================ ROOT HELPER ===

test("synodEvidenceRoot: fixed-width concat layout — case ‖ h_0 ‖ … ‖ h_{n-1}", async () => {
  const root = await synodEvidenceRoot(CASE, [partyBytes(0), partyBytes(1)], async (d) => d);
  assert.deepEqual(root, concatRoot(CASE, [partyBytes(0), partyBytes(1)]));
});

test("synodEvidenceRoot: different hashes ⇒ different root (mismatch is detectable)", async () => {
  const good = await synodEvidenceRoot(CASE, [partyBytes(0), partyBytes(1)], async (d) => d);
  const swapped = await synodEvidenceRoot(CASE, [partyBytes(1), partyBytes(0)], async (d) => d);
  assert.notEqual(hex(good), hex(swapped));
});

// ========================================================= DELIVER BRIDGE ===

test("synod deliver: bound case → 200, one package per party slot, rounds [0..N-1]", async () => {
  const h = [partyBytes(0), partyBytes(1), partyBytes(2)];
  const out = await deliver(
    DISPUTE,
    JUROR,
    deps(
      groupStore(
        new Map([
          [0, slotBundle(0)],
          [1, slotBundle(1)],
          [2, slotBundle(2)],
        ]),
      ),
      chain({ filer: CASE, evidenceHash0: concatRoot(CASE, h), synodCase: caseView(3) }),
    ),
  );
  assert.equal(out.status, 200);
  if (out.status !== 200) throw new Error("unreachable");
  assert.deepEqual(
    out.rounds.map((r) => r.round),
    [0, 1, 2],
    "round field carries the party slot",
  );
  assert.deepEqual(out.rounds[0]!.out, partyBytes(0), "slot plaintext re-encrypted");
  assert.deepEqual(out.rounds[2]!.out, partyBytes(2));
});

test("synod deliver: stored hashes ≠ evidence_hashes[0] → 409, assembly refused", async () => {
  const out = await deliver(
    DISPUTE,
    JUROR,
    deps(
      groupStore(
        new Map([
          [0, slotBundle(0)],
          [1, slotBundle(1)],
        ]),
      ),
      // On-chain root built from a DIFFERENT party-1 hash ⇒ swap detected.
      chain({
        filer: CASE,
        evidenceHash0: concatRoot(CASE, [partyBytes(0), partyBytes(0)]),
        synodCase: caseView(2),
      }),
    ),
  );
  assert.equal(out.status, 409);
  if (out.status !== 409) throw new Error("unreachable");
  assert.match(out.reason, /root/);
});

test("synod deliver: missing slot bundle → 404, nothing assembled", async () => {
  const out = await deliver(
    DISPUTE,
    JUROR,
    deps(
      groupStore(new Map([[0, slotBundle(0)]])), // slot 1 never pushed
      chain({
        filer: CASE,
        evidenceHash0: concatRoot(CASE, [partyBytes(0), partyBytes(1)]),
        synodCase: caseView(2),
      }),
    ),
  );
  assert.equal(out.status, 404);
  if (out.status !== 404) throw new Error("unreachable");
  assert.match(out.reason, /slot 1/);
});

test("synod deliver: ciphertext swapped against its own committed hash → 409", async () => {
  const h = [partyBytes(0), partyBytes(1)];
  const out = await deliver(
    DISPUTE,
    JUROR,
    deps(
      // Slot 1's ct is party-2's bytes but its committed hash is party-1's:
      // the root gate passes, the per-slot plaintext gate must catch it.
      groupStore(
        new Map([
          [0, slotBundle(0)],
          [1, { ...slotBundle(1), ct: partyBytes(2) }],
        ]),
      ),
      chain({ filer: CASE, evidenceHash0: concatRoot(CASE, h), synodCase: caseView(2) }),
    ),
  );
  assert.equal(out.status, 409);
  if (out.status !== 409) throw new Error("unreachable");
  assert.match(out.reason, /slot 1/);
});

test("synod deliver: filer not a bound case → generic per-round path (no bridge)", async () => {
  // Filer is some other program's PDA / case not bound to this dispute:
  // readSynodCase returns null → dispute-keyed evidence flow, which 404s here
  // (no round-0 bundle stored under the dispute key).
  const out = await deliver(
    DISPUTE,
    JUROR,
    deps(
      groupStore(new Map()), // nothing under the dispute key either
      chain({
        filer: NON_SYNOD_FILER,
        evidenceHash0: partyBytes(9),
        synodCase: null,
      }),
    ),
  );
  assert.equal(out.status, 404);
  if (out.status !== 404) throw new Error("unreachable");
  assert.match(out.reason, /round 0|no evidence/);
});

test("synod deliver: case bound to a DIFFERENT dispute → no bridge (staleness guard)", async () => {
  const out = await deliver(
    DISPUTE,
    JUROR,
    deps(
      groupStore(new Map()),
      chain({
        filer: CASE,
        evidenceHash0: partyBytes(9),
        synodCase: caseView(2, new Uint8Array(32).fill(0x77)), // dispute ≠ ours
      }),
    ),
  );
  assert.equal(out.status, 404);
  if (out.status !== 404) throw new Error("unreachable");
  assert.match(out.reason, /round 0|no evidence/);
});
