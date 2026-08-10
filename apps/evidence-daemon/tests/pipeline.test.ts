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
    round: 0,
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
  const key = (s: Uint8Array, d: Uint8Array, r: number) => `${hex(s)}:${hex(d)}:${r}`;
  return {
    objects,
    async exists(s, d, r) {
      return objects.has(key(s, d, r));
    },
    async get(s, d, r) {
      return objects.get(key(s, d, r)) ?? null;
    },
    async put(b) {
      objects.set(key(b.subaccord, b.dispute, b.round), b);
    },
  };
}

function iChain(
  dispute: Uint8Array,
  view: { subaccord: Uint8Array; evidence_hashes: Uint8Array[] } | null,
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
    0,
    iBundle(),
    iDeps(store, iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hashes: [I_HASH] })),
  );
  assert.equal(out.status, 201);
  if (out.status !== 201) throw new Error("unreachable");
  assert.equal(out.idempotent, false);
  const stored = store.objects.get(`${hex(I_SUB)}:${hex(I_DISPUTE)}:0`);
  assert.ok(stored, "bundle stored");
  assert.ok(stored && stored.ingested_at > 0, "ingested_at stamped server-side");
  assert.deepEqual(stored && stored.ct, new Uint8Array([1, 2, 3, 4]), "ct preserved");
});

test("ingest: hash-mismatch (plaintext_hash != evidence_hashes[round]) → 400, nothing stored", async () => {
  const store = iMemoryStore();
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    0,
    iBundle({ plaintext_hash: I_OTHER_HASH }),
    iDeps(store, iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hashes: [I_HASH] })),
  );
  assert.equal(out.status, 400);
  if (out.status !== 400) throw new Error("unreachable");
  assert.match(out.reason, /plaintext_hash/);
  assert.equal(store.objects.size, 0, "nothing stored on rejection");
});

test("ingest: idempotent re-put (same plaintext_hash) → 201 idempotent:true, no duplicate", async () => {
  const store = iMemoryStore();
  const chain = iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hashes: [I_HASH] });
  const first = await ingest(
    I_SUB,
    I_DISPUTE,
    0,
    iBundle({ ingested_at: 12345 }),
    iDeps(store, chain),
  );
  const second = await ingest(
    I_SUB,
    I_DISPUTE,
    0,
    iBundle({ ingested_at: 99999 }),
    iDeps(store, chain),
  );
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  if (second.status !== 201) throw new Error("unreachable");
  assert.equal(second.idempotent, true, "second put is idempotent");
  assert.equal(store.objects.size, 1, "exactly one object stored");
});

test("ingest: conflict (different plaintext_hash for same dispute+round) → 409", async () => {
  const store = iMemoryStore();
  await ingest(
    I_SUB,
    I_DISPUTE,
    0,
    iBundle(),
    iDeps(store, iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hashes: [I_HASH] })),
  );
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    0,
    iBundle({ plaintext_hash: I_OTHER_HASH }),
    iDeps(store, iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hashes: [I_OTHER_HASH] })),
  );
  assert.equal(out.status, 409);
});

test("ingest: structural bad bundle (empty ct / bad pub / bad hash / empty wrapped) → 400", async () => {
  const c = iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hashes: [I_HASH] });
  const d = iDeps(iMemoryStore(), c);
  assert.equal(
    (await ingest(I_SUB, I_DISPUTE, 0, iBundle({ ct: new Uint8Array(0) }), d)).status,
    400,
  );
  assert.equal(
    (await ingest(I_SUB, I_DISPUTE, 0, iBundle({ claimant_ephem_pub: new Uint8Array(31) }), d))
      .status,
    400,
  );
  assert.equal(
    (await ingest(I_SUB, I_DISPUTE, 0, iBundle({ plaintext_hash: new Uint8Array(16) }), d)).status,
    400,
  );
  assert.equal(
    (await ingest(I_SUB, I_DISPUTE, 0, iBundle({ wrapped: new Uint8Array(0) }), d)).status,
    400,
  );
});

test("ingest: path/bundle subaccord mismatch → 400", async () => {
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    0,
    iBundle({ subaccord: new Uint8Array(32).fill(0x7a) }),
    iDeps(iMemoryStore(), iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hashes: [I_HASH] })),
  );
  assert.equal(out.status, 400);
});

test("ingest: dispute not found → 404", async () => {
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    0,
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
    0,
    iBundle(),
    iDeps(store, iChain(I_DISPUTE, { subaccord: I_SUB, evidence_hashes: [I_HASH] })),
  );
  const stored = store.objects.get(`${hex(I_SUB)}:${hex(I_DISPUTE)}:0`);
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
    round: 0,
    ct: new Uint8Array([1, 2, 3]),
    claimant_ephem_pub: new Uint8Array(32).fill(0xcc),
    wrapped: new Uint8Array([9, 9]),
    plaintext_hash: D_HASH,
    ingested_at: 0,
  };
}

function dChain(opts: {
  dispute?: { subaccord: Uint8Array; evidence_hashes: Uint8Array[]; current_round: number } | null;
  subaccord?: { evidence_operator: Uint8Array } | null;
  round?: { jurors: Uint8Array[] } | null;
}): DeliverChainReader {
  return {
    async readDispute() {
      return opts.dispute === undefined
        ? { subaccord: D_SUB, evidence_hashes: [D_HASH], current_round: 0 }
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

test("deliver: happy (drawn juror) → 200 {rounds:[{out, operator_ephem_pub}]}", async () => {
  const out = await deliver(D_DISPUTE, D_JUROR, dDeps({}));
  assert.equal(out.status, 200);
  if (out.status !== 200) throw new Error("unreachable");
  assert.equal(out.rounds.length, 1, "single evidence_hashes entry → one round-0 package");
  assert.equal(out.rounds[0]!.round, 0);
  assert.deepEqual(
    out.rounds[0]!.out,
    D_PLAINTEXT,
    "out is the (watermarked) plaintext via stub reencrypt",
  );
  assert.deepEqual(out.rounds[0]!.operator_ephem_pub, D_EPH);
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

test("deliver: gate-fail (sha256(plaintext) != evidence_hashes[0]) → 409", async () => {
  const out = await deliver(
    D_DISPUTE,
    D_JUROR,
    dDeps({
      chain: dChain({
        dispute: {
          subaccord: D_SUB,
          evidence_hashes: [new Uint8Array(32).fill(0x11)],
          current_round: 0,
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

// ============================================== DELIVER (multi-round) ===
// ADR-0023 (milestone accord-qp7c): a juror drawn in round N receives every
// non-zero manifest from round 0..N. Each round is gated against its own
// evidence_hashes[k] and re-encrypted as a separate package. `[0u8;32]` is the
// "no new evidence this round" sentinel — skipped, no bundle fetched. A gate
// failure at any round fails the whole delivery (tampering — no partial set).

const ZERO32 = new Uint8Array(32); // ADR-0023 sentinel

/** Per-round store: returns the bundle stashed under `round`, else null. */
function roundStore(byRound: Map<number, EvidenceBundle>): DeliverStore {
  return {
    async get(_sa, _d, round) {
      return byRound.get(round) ?? null;
    },
  };
}

/**
 * Multi-round crypto stub. `sha256` is the identity (so the "hash" is the
 * plaintext bytes themselves); `unwrap` returns the bundle's `ct` as the
 * plaintext; `reencrypt` echoes the watermarked bytes. Lets each round carry a
 * distinct plaintext without real crypto.
 */
function multiCrypto(): DeliveryCrypto {
  return {
    sha256: async (data) => data,
    async unwrap(bundle) {
      return { plaintext: bundle.ct };
    },
    async reencryptToJuror(wm) {
      return { out: wm, operator_ephem_pub: D_EPH };
    },
  };
}

/** Bundle whose stub-plaintext (== ct) is `pt`; gated via the identity sha256. */
function rBundle(pt: Uint8Array, round = 0): EvidenceBundle {
  return {
    subaccord: D_SUB,
    dispute: D_DISPUTE,
    round,
    ct: pt,
    claimant_ephem_pub: new Uint8Array(32).fill(0xcc),
    wrapped: new Uint8Array([9, 9]),
    plaintext_hash: pt,
    ingested_at: 0,
  };
}

function multiChain(hashes: Uint8Array[], currentRound: number): DeliverChainReader {
  return dChain({
    dispute: { subaccord: D_SUB, evidence_hashes: hashes, current_round: currentRound },
  });
}

function multiDeps(parts: {
  store: DeliverStore;
  hashes: Uint8Array[];
  currentRound: number;
}): DeliverDeps {
  return {
    store: parts.store,
    chain: multiChain(parts.hashes, parts.currentRound),
    keyring: dKeyring(D_OP_SK),
    crypto: multiCrypto(),
  };
}

test("deliver: multi-round — 3 non-zero hashes → 200 rounds [0,1,2], each gated + re-encrypted", async () => {
  const h0 = new Uint8Array(32).fill(0xa1);
  const h1 = new Uint8Array(32).fill(0xa2);
  const h2 = new Uint8Array(32).fill(0xa3);
  const out = await deliver(
    D_DISPUTE,
    D_JUROR,
    multiDeps({
      store: roundStore(
        new Map([
          [0, rBundle(h0)],
          [1, rBundle(h1)],
          [2, rBundle(h2)],
        ]),
      ),
      hashes: [h0, h1, h2],
      currentRound: 2,
    }),
  );
  assert.equal(out.status, 200);
  if (out.status !== 200) throw new Error("unreachable");
  assert.equal(out.rounds.length, 3);
  assert.deepEqual(
    out.rounds.map((r) => r.round),
    [0, 1, 2],
    "round-ascending, one package per non-zero hash",
  );
  assert.deepEqual(out.rounds[0]!.out, h0);
  assert.deepEqual(out.rounds[1]!.out, h1);
  assert.deepEqual(out.rounds[2]!.out, h2);
});

test("deliver: sentinel — [0u8;32] at slot 1 → only rounds 0 and 2 (slot 1 skipped, no fetch)", async () => {
  const h0 = new Uint8Array(32).fill(0xb1);
  const h2 = new Uint8Array(32).fill(0xb3);
  let slot1Fetched = false;
  const store: DeliverStore = {
    async get(_sa, _d, round) {
      if (round === 1) slot1Fetched = true;
      if (round === 0) return rBundle(h0);
      if (round === 2) return rBundle(h2);
      return null;
    },
  };
  const out = await deliver(
    D_DISPUTE,
    D_JUROR,
    multiDeps({ store, hashes: [h0, ZERO32, h2], currentRound: 2 }),
  );
  assert.equal(out.status, 200);
  if (out.status !== 200) throw new Error("unreachable");
  assert.deepEqual(
    out.rounds.map((r) => r.round),
    [0, 2],
    "sentinel slot yields no package",
  );
  assert.equal(slot1Fetched, false, "sentinel slot must not fetch a bundle");
});

test("deliver: gate-fail at round 2 → 409 (whole delivery fails, no partial set)", async () => {
  const h0 = new Uint8Array(32).fill(0xc1);
  const h1 = new Uint8Array(32).fill(0xc2);
  const h2 = new Uint8Array(32).fill(0xc3);
  const out = await deliver(
    D_DISPUTE,
    D_JUROR,
    multiDeps({
      // round 2's plaintext (0xff..) != h2 (0xc3..) → its gate fails.
      store: roundStore(
        new Map([
          [0, rBundle(h0)],
          [1, rBundle(h1)],
          [2, rBundle(new Uint8Array(32).fill(0xff))],
        ]),
      ),
      hashes: [h0, h1, h2],
      currentRound: 2,
    }),
  );
  assert.equal(out.status, 409);
  if (out.status !== 409) throw new Error("unreachable");
  assert.match(out.reason, /round 2/i);
});

test("deliver: missing bundle for a non-zero round → 404", async () => {
  const h0 = new Uint8Array(32).fill(0xd1);
  const h1 = new Uint8Array(32).fill(0xd2);
  const out = await deliver(
    D_DISPUTE,
    D_JUROR,
    multiDeps({
      store: roundStore(new Map([[0, rBundle(h0)]])), // round 1 bundle absent
      hashes: [h0, h1],
      currentRound: 1,
    }),
  );
  assert.equal(out.status, 404);
  if (out.status !== 404) throw new Error("unreachable");
  assert.match(out.reason, /round 1/i);
});

test("deliver: bounded by current_round — round-1 juror does not receive round-2 evidence", async () => {
  const h0 = new Uint8Array(32).fill(0xe1);
  const h1 = new Uint8Array(32).fill(0xe2);
  const h2 = new Uint8Array(32).fill(0xe3);
  const out = await deliver(
    D_DISPUTE,
    D_JUROR,
    multiDeps({
      store: roundStore(
        new Map([
          [0, rBundle(h0)],
          [1, rBundle(h1)],
          [2, rBundle(h2)],
        ]),
      ),
      // current_round=1 → bound = min(2, 3) = 2 → rounds 0,1 only; slot 2 withheld.
      hashes: [h0, h1, h2],
      currentRound: 1,
    }),
  );
  assert.equal(out.status, 200);
  if (out.status !== 200) throw new Error("unreachable");
  assert.deepEqual(
    out.rounds.map((r) => r.round),
    [0, 1],
    "future-round evidence withheld",
  );
});

// ============================================ INGEST (per-round, ADR-0023) ===
// Round 0 = filer; round 1..MAX_APPEALS = appeal evidence. Each round's bundle
// is gated against evidence_hashes[round] and stored under its own key. The
// [0u8;32] sentinel means "no new evidence this round" — a claimant cannot
// ingest against a sentinel slot (the hash can never match).

const APPEAL_HASH = new Uint8Array(32).fill(0x5a);
const ZERO_HASH = new Uint8Array(32); // ADR-0023 sentinel

/** evidence_hashes fixture: round 0 = I_HASH, round k = given, else zero. */
function iHashes(
  round: number,
  hash: Uint8Array,
): { subaccord: Uint8Array; evidence_hashes: Uint8Array[] } {
  const arr = [I_HASH, ZERO_HASH, ZERO_HASH, ZERO_HASH];
  arr[round] = hash;
  return { subaccord: I_SUB, evidence_hashes: arr };
}

test("ingest: round 1 appeal evidence stored at its own key, gated against evidence_hashes[1]", async () => {
  const store = iMemoryStore();
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    1,
    iBundle({ round: 1, plaintext_hash: APPEAL_HASH }),
    iDeps(store, iChain(I_DISPUTE, iHashes(1, APPEAL_HASH))),
  );
  assert.equal(out.status, 201);
  // Stored under the round-1 key, NOT round 0.
  assert.ok(store.objects.has(`${hex(I_SUB)}:${hex(I_DISPUTE)}:1`));
  assert.ok(!store.objects.has(`${hex(I_SUB)}:${hex(I_DISPUTE)}:0`));
});

test("ingest: round>0 + round 0 coexist as distinct keys", async () => {
  const store = iMemoryStore();
  const chain = iChain(I_DISPUTE, iHashes(1, APPEAL_HASH));
  await ingest(I_SUB, I_DISPUTE, 0, iBundle(), iDeps(store, chain));
  await ingest(
    I_SUB,
    I_DISPUTE,
    1,
    iBundle({ round: 1, plaintext_hash: APPEAL_HASH }),
    iDeps(store, chain),
  );
  assert.equal(store.objects.size, 2, "round 0 and round 1 stored independently");
});

test("ingest: path/bundle round mismatch → 400", async () => {
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    1, // path says round 1
    iBundle({ round: 0 }), // bundle says round 0
    iDeps(iMemoryStore(), iChain(I_DISPUTE, iHashes(1, APPEAL_HASH))),
  );
  assert.equal(out.status, 400);
  if (out.status !== 400) throw new Error("unreachable");
  assert.match(out.reason, /round/);
});

test("ingest: out-of-bounds round (no evidence_hashes slot) → 400", async () => {
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    9, // beyond the 4-slot array
    iBundle({ round: 9 }),
    iDeps(iMemoryStore(), iChain(I_DISPUTE, iHashes(1, APPEAL_HASH))),
  );
  assert.equal(out.status, 400);
});

test("ingest: sentinel slot ([0u8;32]) rejects a real plaintext_hash → 400", async () => {
  // Round 2 is the sentinel (no new evidence) — a claimant cannot ingest for it.
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    2,
    iBundle({ round: 2, plaintext_hash: APPEAL_HASH }),
    iDeps(iMemoryStore(), iChain(I_DISPUTE, iHashes(1, APPEAL_HASH))),
  );
  assert.equal(out.status, 400);
  if (out.status !== 400) throw new Error("unreachable");
  assert.match(out.reason, /evidence_hashes\[2\]/);
});

test("ingest: negative round → 400", async () => {
  const out = await ingest(
    I_SUB,
    I_DISPUTE,
    -1,
    iBundle({ round: -1 }),
    iDeps(iMemoryStore(), iChain(I_DISPUTE, iHashes(0, I_HASH))),
  );
  assert.equal(out.status, 400);
});
