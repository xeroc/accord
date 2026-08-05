// ingest.test.ts — runnable self-check for the ingest pipeline (v1).
//   bun test apps/evidence-daemon/tests/ingest.test.ts
//
// Covers the bean scope: structural 400s, metadata validation
// (plaintext_hash == evidence_hash), idempotent 201/409, 404 not-found, and
// the encrypted-at-rest invariant (stored object is ciphertext-only).
//
// Stub chain reader + in-memory EvidenceStore stand in for the not-yet-landed
// chain reader (accord-mwfq) and S3Store (accord-xrdc). The decrypt-and-verify
// gate (needs crypto, accord-vknh) is intentionally out of scope here.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ingest,
  type EvidenceBundle,
  type IngestChainReader,
  type IngestDeps,
  type IngestStore,
} from "../src/pipeline/ingest.ts";

const SUB = new Uint8Array(32).fill(0x01);
const DISPUTE = new Uint8Array(32).fill(0x02);
const HASH = new Uint8Array(32).fill(0xaa);
const OTHER_HASH = new Uint8Array(32).fill(0xbb);

function bundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    subaccord: SUB,
    dispute: DISPUTE,
    ct: new Uint8Array([1, 2, 3, 4]),
    claimant_ephem_pub: new Uint8Array(32).fill(0xcc),
    wrapped: new Uint8Array([9, 9, 9]),
    plaintext_hash: HASH,
    ingested_at: 0,
    ...overrides,
  };
}

function memoryStore(): IngestStore & {
  count: number;
  objects: Map<string, EvidenceBundle>;
} {
  const objects = new Map<string, EvidenceBundle>();
  const key = (s: Uint8Array, d: Uint8Array) =>
    `${Buffer.from(s).toString("hex")}:${Buffer.from(d).toString("hex")}`;
  return {
    objects,
    count: 0,
    async exists(s, d) {
      return objects.has(key(s, d));
    },
    async get(s, d) {
      return objects.get(key(s, d)) ?? null;
    },
    async put(b) {
      objects.set(key(b.subaccord, b.dispute), b);
    },
  };
}

function chainWith(
  dispute: EvidenceBundle["dispute"],
  view: { subaccord: Uint8Array; evidence_hash: Uint8Array } | null,
): IngestChainReader {
  return {
    async readDispute(d) {
      if (
        Buffer.from(d).toString("hex") !== Buffer.from(dispute).toString("hex")
      )
        return null;
      return view;
    },
  };
}

function deps(store: IngestStore, chain: IngestChainReader): IngestDeps {
  return { store, chain };
}

test("happy: new bundle → 201, idempotent:false, stored with server-stamped ingested_at", async () => {
  const store = memoryStore();
  const out = await ingest(
    SUB,
    DISPUTE,
    bundle(),
    deps(store, chainWith(DISPUTE, { subaccord: SUB, evidence_hash: HASH })),
  );
  assert.equal(out.status, 201);
  if (out.status !== 201) throw new Error("unreachable");
  assert.equal(out.idempotent, false);
  const stored = store.objects.get(
    `${Buffer.from(SUB).toString("hex")}:${Buffer.from(DISPUTE).toString("hex")}`,
  );
  assert.ok(stored, "bundle stored");
  assert.ok(
    stored && stored.ingested_at > 0,
    "ingested_at stamped server-side",
  );
  assert.deepEqual(
    stored && stored.ct,
    new Uint8Array([1, 2, 3, 4]),
    "ct preserved",
  );
});

test("idempotent: same plaintext_hash re-put → 201 idempotent:true, no duplicate object", async () => {
  const store = memoryStore();
  const chain = chainWith(DISPUTE, { subaccord: SUB, evidence_hash: HASH });
  const first = await ingest(
    SUB,
    DISPUTE,
    bundle({ ingested_at: 12345 }),
    deps(store, chain),
  );
  const second = await ingest(
    SUB,
    DISPUTE,
    bundle({ ingested_at: 99999 }),
    deps(store, chain),
  );
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  if (second.status !== 201) throw new Error("unreachable");
  assert.equal(second.idempotent, true, "second put is idempotent");
  let n = 0;
  for (const _ of store.objects.values()) n++;
  assert.equal(n, 1, "exactly one object stored");
});

test("conflict: different plaintext_hash for same dispute → 409", async () => {
  const store = memoryStore();
  const chain = chainWith(DISPUTE, { subaccord: SUB, evidence_hash: HASH });
  await ingest(SUB, DISPUTE, bundle(), deps(store, chain));
  // chain now reports a different evidence_hash matching a different bundle hash
  const chain2 = chainWith(DISPUTE, {
    subaccord: SUB,
    evidence_hash: OTHER_HASH,
  });
  const out = await ingest(
    SUB,
    DISPUTE,
    bundle({ plaintext_hash: OTHER_HASH }),
    deps(store, chain2),
  );
  assert.equal(out.status, 409);
});

test("metadata mismatch: plaintext_hash != Dispute.evidence_hash → 400", async () => {
  const store = memoryStore();
  const out = await ingest(
    SUB,
    DISPUTE,
    bundle({ plaintext_hash: OTHER_HASH }),
    deps(store, chainWith(DISPUTE, { subaccord: SUB, evidence_hash: HASH })),
  );
  assert.equal(out.status, 400);
  if (out.status !== 400) throw new Error("unreachable");
  assert.match(out.reason, /plaintext_hash/);
  assert.equal(store.objects.size, 0, "nothing stored on rejection");
});

test("structural: empty ct → 400", async () => {
  const out = await ingest(
    SUB,
    DISPUTE,
    bundle({ ct: new Uint8Array(0) }),
    deps(
      memoryStore(),
      chainWith(DISPUTE, { subaccord: SUB, evidence_hash: HASH }),
    ),
  );
  assert.equal(out.status, 400);
});

test("structural: claimant_ephem_pub wrong size → 400", async () => {
  const out = await ingest(
    SUB,
    DISPUTE,
    bundle({ claimant_ephem_pub: new Uint8Array(31) }),
    deps(
      memoryStore(),
      chainWith(DISPUTE, { subaccord: SUB, evidence_hash: HASH }),
    ),
  );
  assert.equal(out.status, 400);
});

test("structural: plaintext_hash wrong size → 400", async () => {
  const out = await ingest(
    SUB,
    DISPUTE,
    bundle({ plaintext_hash: new Uint8Array(16) }),
    deps(
      memoryStore(),
      chainWith(DISPUTE, { subaccord: SUB, evidence_hash: HASH }),
    ),
  );
  assert.equal(out.status, 400);
});

test("structural: empty wrapped DEK → 400", async () => {
  const out = await ingest(
    SUB,
    DISPUTE,
    bundle({ wrapped: new Uint8Array(0) }),
    deps(
      memoryStore(),
      chainWith(DISPUTE, { subaccord: SUB, evidence_hash: HASH }),
    ),
  );
  assert.equal(out.status, 400);
});

test("path/bundle mismatch: bundle.subaccord != path subaccord → 400", async () => {
  const out = await ingest(
    SUB,
    DISPUTE,
    bundle({ subaccord: new Uint8Array(32).fill(0x7a) }),
    deps(
      memoryStore(),
      chainWith(DISPUTE, { subaccord: SUB, evidence_hash: HASH }),
    ),
  );
  assert.equal(out.status, 400);
});

test("dispute subaccord mismatch: Dispute.subaccord != path → 400", async () => {
  const out = await ingest(
    SUB,
    DISPUTE,
    bundle(),
    deps(
      memoryStore(),
      chainWith(DISPUTE, {
        subaccord: new Uint8Array(32).fill(0x7a),
        evidence_hash: HASH,
      }),
    ),
  );
  assert.equal(out.status, 400);
});

test("not-found: dispute missing on-chain → 404", async () => {
  const out = await ingest(
    SUB,
    DISPUTE,
    bundle(),
    deps(memoryStore(), chainWith(DISPUTE, null)),
  );
  assert.equal(out.status, 404);
});

test("encrypted-at-rest: stored object never carries a plaintext field", async () => {
  const store = memoryStore();
  await ingest(
    SUB,
    DISPUTE,
    bundle(),
    deps(store, chainWith(DISPUTE, { subaccord: SUB, evidence_hash: HASH })),
  );
  const stored = store.objects.get(
    `${Buffer.from(SUB).toString("hex")}:${Buffer.from(DISPUTE).toString("hex")}`,
  );
  assert.ok(stored);
  const keys = Object.keys(stored as object);
  assert.ok(!keys.includes("plaintext"), "no plaintext field on stored bundle");
  assert.ok(keys.includes("ct"), "ciphertext field present");
});
