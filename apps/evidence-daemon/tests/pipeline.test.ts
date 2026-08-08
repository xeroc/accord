// pipeline.test.ts — canonical pipeline suite (ingest + deliver), per SPEC
// module layout and HANDOFF §6 test matrix.
//   bun test apps/evidence-daemon/tests/pipeline.test.ts
//
// Stub chain reader + in-memory EvidenceStore stand in for the not-yet-landed
// chain reader (accord-mwfq), S3Store (accord-xrdc), keyring (accord-11im), and
// crypto core (accord-vknh). The decrypt-and-verify ingest gate and real
// crypto are out of scope here (covered by crypto.test.ts once accord-vknh
// lands). Matrix:
//   ingest:  happy / hash-mismatch / idempotent
//   deliver: happy / not-drawn / premature / unknown-operator / gate-fail
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ingest,
  type EvidenceBundle,
  type IngestChainReader,
  type IngestDeps,
  type IngestStore,
} from "../src/pipeline/ingest.ts";
import {
  deliver,
  type DeliverChainReader,
  type DeliverDeps,
  type DeliverStore,
  type DeliveryCrypto,
  type Keyring,
} from "../src/pipeline/deliver.ts";
import type { Watermark } from "../src/pipeline/watermark.ts";

// ---------------------------------------------------------------- helpers ----
function hex(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}

// ================================================================== INGEST ===
const I_SUB = new Uint8Array(32).fill(0x01);
const I_DISPUTE = new Uint8Array(32).fill(0x02);
const I_HASH = new Uint8Array(32).fill(0xaa);
const I_OTHER_HASH = new Uint8Array(32).fill(0xbb);

function iBundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    subaccord: I_SUB,
    dispute: I_DISPUTE,
    ct: new Uint8Array([1, 2, 3, 4]),
    claimant_ephem_pub: new Uint8Array(32).fill(0xcc),
    wrapped: new Uint8Array([9, 9, 9]),
    plaintext_hash: I_HASH,
    ingested_at: 0,
    ...overrides,
  };
}

function iMemoryStore(): IngestStore & {
  objects: Map<string, EvidenceBundle>;
} {
  const objects = new Map<string, EvidenceBundle>();
  const key = (s: Uint8Array, d: Uint8Array) => `${hex(s)}:${hex(d)}`;
  return {
    objects,
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

function iChain(
  dispute: Uint8Array,
  view: { subaccord: Uint8Array; evidence_hash: Uint8Array } | null,
): IngestChainReader {
  return {
    async readDispute(d) {
      if (hex(d) !== hex(dispute)) return null;
      return view;
    },
  };
}

function iDeps(store: IngestStore, chain: IngestChainReader): IngestDeps {
  return { store, chain };
}

test("ingest: happy → 201, idempotent:false, stored with server-stamped ingested_at", async () => {
  const store = iMemoryStore();
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    iBundle(),
    iDeps(store, iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hash: I_HASH })),
  );
  assert.equal(out.status, 201);
  if (out.status !== 201) throw new Error("unreachable");
  assert.equal(out.idempotent, false);
  const stored = store.objects.get(`${hex(I_SUB)}:${hex(I_DISPUTE)}`);
  assert.ok(stored, "bundle stored");
  assert.ok(stored && stored.ingested_at > 0, "ingested_at stamped server-side");
  assert.deepEqual(stored && stored.ct, new Uint8Array([1, 2, 3, 4]), "ct preserved");
});

test("ingest: hash-mismatch (plaintext_hash != evidence_hash) → 400, nothing stored", async () => {
  const store = iMemoryStore();
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    iBundle({ plaintext_hash: I_OTHER_HASH }),
    iDeps(store, iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hash: I_HASH })),
  );
  assert.equal(out.status, 400);
  if (out.status !== 400) throw new Error("unreachable");
  assert.match(out.reason, /plaintext_hash/);
  assert.equal(store.objects.size, 0, "nothing stored on rejection");
});

test("ingest: idempotent re-put (same plaintext_hash) → 201 idempotent:true, no duplicate", async () => {
  const store = iMemoryStore();
  const chain = iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hash: I_HASH });
  const first = await ingest(
    I_SUB,
    I_DISPUTE,
    iBundle({ ingested_at: 12345 }),
    iDeps(store, chain),
  );
  const second = await ingest(
    I_SUB,
    I_DISPUTE,
    iBundle({ ingested_at: 99999 }),
    iDeps(store, chain),
  );
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  if (second.status !== 201) throw new Error("unreachable");
  assert.equal(second.idempotent, true, "second put is idempotent");
  assert.equal(store.objects.size, 1, "exactly one object stored");
});

test("ingest: conflict (different plaintext_hash for same dispute) → 409", async () => {
  const store = iMemoryStore();
  await ingest(
    I_SUB,
    I_DISPUTE,
    iBundle(),
    iDeps(store, iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hash: I_HASH })),
  );
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    iBundle({ plaintext_hash: I_OTHER_HASH }),
    iDeps(store, iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hash: I_OTHER_HASH })),
  );
  assert.equal(out.status, 409);
});

test("ingest: structural bad bundle (empty ct / bad pub / bad hash / empty wrapped) → 400", async () => {
  const c = iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hash: I_HASH });
  const d = iDeps(iMemoryStore(), c);
  assert.equal((await ingest(I_SUB, I_DISPUTE, iBundle({ ct: new Uint8Array(0) }), d)).status, 400);
  assert.equal(
    (await ingest(I_SUB, I_DISPUTE, iBundle({ claimant_ephem_pub: new Uint8Array(31) }), d)).status,
    400,
  );
  assert.equal(
    (await ingest(I_SUB, I_DISPUTE, iBundle({ plaintext_hash: new Uint8Array(16) }), d)).status,
    400,
  );
  assert.equal(
    (await ingest(I_SUB, I_DISPUTE, iBundle({ wrapped: new Uint8Array(0) }), d)).status,
    400,
  );
});

test("ingest: path/bundle subaccord mismatch → 400", async () => {
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    iBundle({ subaccord: new Uint8Array(32).fill(0x7a) }),
    iDeps(iMemoryStore(), iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hash: I_HASH })),
  );
  assert.equal(out.status, 400);
});

test("ingest: dispute not found → 404", async () => {
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    iBundle(),
    iDeps(iMemoryStore(), iChain(I_DISPUTE, null)),
  );
  assert.equal(out.status, 404);
});

test("ingest: encrypted-at-rest — stored object has no plaintext field", async () => {
  const store = iMemoryStore();
  await ingest(
    I_SUB,
    I_DISPUTE,
    iBundle(),
    iDeps(store, iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hash: I_HASH })),
  );
  const stored = store.objects.get(`${hex(I_SUB)}:${hex(I_DISPUTE)}`);
  assert.ok(stored);
  const keys = Object.keys(stored as object);
  assert.ok(!keys.includes("plaintext"), "no plaintext field on stored bundle");
  assert.ok(keys.includes("ct"), "ciphertext field present");
});

// ================================================================ DELIVER ===
const D_DISPUTE = new Uint8Array(32).fill(0x02);
const D_SUB = new Uint8Array(32).fill(0x01);
const D_OPERATOR = new Uint8Array(32).fill(0x03);
const D_JUROR = new Uint8Array(32).fill(0x04);
const D_OTHER_JUROR = new Uint8Array(32).fill(0x05);
const D_OP_SK = new Uint8Array(64).fill(0x77);
const D_PLAINTEXT = new Uint8Array([10, 20, 30, 40]);
const D_HASH = new Uint8Array(32).fill(0xee);
const D_EPH = new Uint8Array(32).fill(0xe0);

function dBundle(): EvidenceBundle {
  return {
    subaccord: D_SUB,
    dispute: D_DISPUTE,
    ct: new Uint8Array([1, 2, 3]),
    claimant_ephem_pub: new Uint8Array(32).fill(0xcc),
    wrapped: new Uint8Array([9, 9]),
    plaintext_hash: D_HASH,
    ingested_at: 0,
  };
}

function dChain(opts: {
  dispute?: { subaccord: Uint8Array; evidence_hash: Uint8Array } | null;
  subaccord?: { evidence_operator: Uint8Array } | null;
  round?: { jurors: Uint8Array[] } | null;
}): DeliverChainReader {
  return {
    async readDispute() {
      return opts.dispute === undefined
        ? { subaccord: D_SUB, evidence_hash: D_HASH }
        : opts.dispute;
    },
    async readSubaccord() {
      return opts.subaccord === undefined ? { evidence_operator: D_OPERATOR } : opts.subaccord;
    },
    async readRound() {
      return opts.round === undefined ? { jurors: [D_JUROR, D_OTHER_JUROR] } : opts.round;
    },
  };
}

function dStoreWith(b: EvidenceBundle | null): DeliverStore {
  return {
    async get() {
      return b;
    },
  };
}

function dKeyring(sk: Uint8Array | null): Keyring {
  return {
    async forOperator() {
      return sk;
    },
  };
}

function dCrypto(opts: {
  plaintext?: Uint8Array | null;
  hash?: Uint8Array;
  reencryptInput?: { val: Uint8Array };
}): DeliveryCrypto {
  return {
    sha256: async () => opts.hash ?? D_HASH,
    unwrap: async () =>
      opts.plaintext === undefined
        ? { plaintext: D_PLAINTEXT }
        : opts.plaintext === null
          ? null
          : { plaintext: opts.plaintext },
    reencryptToJuror: async (wm) => {
      if (opts.reencryptInput) opts.reencryptInput.val = wm;
      return { out: wm, operator_ephem_pub: D_EPH };
    },
  };
}

function dDeps(parts: Partial<DeliverDeps>): DeliverDeps {
  return {
    store: parts.store ?? dStoreWith(dBundle()),
    chain: parts.chain ?? dChain({}),
    keyring: parts.keyring ?? dKeyring(D_OP_SK),
    crypto: parts.crypto ?? dCrypto({}),
    watermark: parts.watermark,
  };
}

test("deliver: happy (drawn juror) → 200 {out, operator_ephem_pub}", async () => {
  const out = await deliver(D_DISPUTE, D_JUROR, dDeps({}));
  assert.equal(out.status, 200);
  if (out.status !== 200) throw new Error("unreachable");
  assert.deepEqual(out.out, D_PLAINTEXT, "out is the (watermarked) plaintext via stub reencrypt");
  assert.deepEqual(out.operator_ephem_pub, D_EPH);
});

test("deliver: premature (round missing / not yet drawn) → 404", async () => {
  const out = await deliver(D_DISPUTE, D_JUROR, dDeps({ chain: dChain({ round: null }) }));
  assert.equal(out.status, 404);
  if (out.status !== 404) throw new Error("unreachable");
  assert.match(out.reason, /drawn/i);
});

test("deliver: not-drawn (juror absent from Round.jurors) → 404", async () => {
  const out = await deliver(D_DISPUTE, new Uint8Array(32).fill(0xff), dDeps({}));
  assert.equal(out.status, 404);
  if (out.status !== 404) throw new Error("unreachable");
  assert.match(out.reason, /juror/i);
});

test("deliver: unknown evidence operator (keyring null) → 404", async () => {
  const out = await deliver(D_DISPUTE, D_JUROR, dDeps({ keyring: dKeyring(null) }));
  assert.equal(out.status, 404);
  if (out.status !== 404) throw new Error("unreachable");
  assert.match(out.reason, /operator/i);
});

test("deliver: missing dispute → 404", async () => {
  const out = await deliver(D_DISPUTE, D_JUROR, dDeps({ chain: dChain({ dispute: null }) }));
  assert.equal(out.status, 404);
});

test("deliver: no evidence ingested (store null) → 404", async () => {
  const out = await deliver(D_DISPUTE, D_JUROR, dDeps({ store: dStoreWith(null) }));
  assert.equal(out.status, 404);
});

test("deliver: gate-fail (sha256(plaintext) != evidence_hash) → 409", async () => {
  const out = await deliver(
    D_DISPUTE,
    D_JUROR,
    dDeps({
      chain: dChain({
        dispute: {
          subaccord: D_SUB,
          evidence_hash: new Uint8Array(32).fill(0x11),
        },
      }),
    }),
  );
  assert.equal(out.status, 409);
  if (out.status !== 409) throw new Error("unreachable");
  assert.match(out.reason, /integrity|hash/i);
});

test("deliver: decrypt-failure (undecryptable/tampered bundle) → 409", async () => {
  const out = await deliver(D_DISPUTE, D_JUROR, dDeps({ crypto: dCrypto({ plaintext: null }) }));
  assert.equal(out.status, 409);
  if (out.status !== 409) throw new Error("unreachable");
  assert.match(out.reason, /decrypt|tamper/i);
});

test("deliver: watermark seam — a custom Watermark's output reaches reencryptToJuror", async () => {
  const tagging: Watermark = {
    apply: (plaintext) => {
      const t = new Uint8Array(plaintext.length + 1);
      t.set(new Uint8Array([0xfe]), 0);
      t.set(plaintext, 1);
      return t;
    },
  };
  const captured: { val: Uint8Array } = { val: new Uint8Array(0) };
  const out = await deliver(
    D_DISPUTE,
    D_JUROR,
    dDeps({
      watermark: tagging,
      crypto: dCrypto({ reencryptInput: captured }),
    }),
  );
  assert.equal(out.status, 200);
  assert.equal(
    captured.val[0],
    0xfe,
    "reencrypt received watermarked (tagged) bytes, not raw plaintext",
  );
  assert.deepEqual(
    captured.val.subarray(1),
    D_PLAINTEXT,
    "plaintext payload preserved after the tag",
  );
});

test("deliver: encrypted-at-rest — store object exposes no plaintext field", async () => {
  let seen: EvidenceBundle | null = null;
  const store: DeliverStore = {
    async get() {
      seen = dBundle();
      return seen;
    },
  };
  const out = await deliver(D_DISPUTE, D_JUROR, dDeps({ store }));
  assert.equal(out.status, 200);
  assert.ok(seen);
  assert.ok(
    !Object.keys(seen as object).includes("plaintext"),
    "store object has no plaintext field",
  );
});
