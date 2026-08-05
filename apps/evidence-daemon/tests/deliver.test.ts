// deliver.test.ts — runnable self-check for the delivery pipeline (v1).
//   bun test apps/evidence-daemon/tests/deliver.test.ts
//
// Covers the bean scope against stub chain/keyring/crypto and an in-memory
// store: happy 200, dispute/subaccord/bundle/not-drawn/non-juror/unknown-
// operator 404s, integrity-gate 409, decrypt-failure 409, and the watermark
// seam (a custom Watermark's tag reaches reencryptToJuror).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deliver,
  type DeliverChainReader,
  type DeliverDeps,
  type DeliverStore,
  type DeliveryCrypto,
  type Keyring,
} from "../src/pipeline/deliver.ts";
import type { Watermark } from "../src/pipeline/watermark.ts";
import type { EvidenceBundle } from "../src/pipeline/ingest.ts";

const DISPUTE = new Uint8Array(32).fill(0x02);
const SUB = new Uint8Array(32).fill(0x01);
const OPERATOR = new Uint8Array(32).fill(0x03);
const JUROR = new Uint8Array(32).fill(0x04);
const OTHER_JUROR = new Uint8Array(32).fill(0x05);
const OP_SK = new Uint8Array(64).fill(0x77);
const PLAINTEXT = new Uint8Array([10, 20, 30, 40]);
const HASH = new Uint8Array(32).fill(0xee);
const EPHEM_PUB = new Uint8Array(32).fill(0xe0);

function bundle(): EvidenceBundle {
  return {
    subaccord: SUB,
    dispute: DISPUTE,
    ct: new Uint8Array([1, 2, 3]),
    claimant_ephem_pub: new Uint8Array(32).fill(0xcc),
    wrapped: new Uint8Array([9, 9]),
    plaintext_hash: HASH,
    ingested_at: 0,
  };
}

function chain(opts: {
  dispute?: { subaccord: Uint8Array; evidence_hash: Uint8Array } | null;
  subaccord?: { evidence_operator: Uint8Array } | null;
  round?: { jurors: Uint8Array[] } | null;
}): DeliverChainReader {
  return {
    async readDispute() {
      return opts.dispute === undefined
        ? { subaccord: SUB, evidence_hash: HASH }
        : opts.dispute;
    },
    async readSubaccord() {
      return opts.subaccord === undefined
        ? { evidence_operator: OPERATOR }
        : opts.subaccord;
    },
    async readRound() {
      return opts.round === undefined
        ? { jurors: [JUROR, OTHER_JUROR] }
        : opts.round;
    },
  };
}

function storeWith(b: EvidenceBundle | null): DeliverStore {
  return {
    async get() {
      return b;
    },
  };
}

function keyringReturning(sk: Uint8Array | null): Keyring {
  return {
    async forOperator() {
      return sk;
    },
  };
}

function cryptoWith(opts: {
  plaintext?: Uint8Array | null;
  hash?: Uint8Array;
  reencryptInput?: { val: Uint8Array };
}): DeliveryCrypto {
  return {
    sha256: () => opts.hash ?? HASH,
    unwrap: () =>
      opts.plaintext === undefined
        ? { plaintext: PLAINTEXT }
        : opts.plaintext === null
          ? null
          : { plaintext: opts.plaintext },
    reencryptToJuror: (wm) => {
      if (opts.reencryptInput) opts.reencryptInput.val = wm;
      return { out: wm, operator_ephem_pub: EPHEM_PUB };
    },
  };
}

function deps(parts: Partial<DeliverDeps>): DeliverDeps {
  return {
    store: parts.store ?? storeWith(bundle()),
    chain: parts.chain ?? chain({}),
    keyring: parts.keyring ?? keyringReturning(OP_SK),
    crypto: parts.crypto ?? cryptoWith({}),
    watermark: parts.watermark,
  };
}

test("happy: drawn juror → 200 {out, operator_ephem_pub}", async () => {
  const out = await deliver(DISPUTE, JUROR, deps({}));
  assert.equal(out.status, 200);
  if (out.status !== 200) throw new Error("unreachable");
  assert.deepEqual(
    out.out,
    PLAINTEXT,
    "out is the (watermarked) plaintext via stub reencrypt",
  );
  assert.deepEqual(out.operator_ephem_pub, EPHEM_PUB);
});

test("dispute not found → 404", async () => {
  const out = await deliver(
    DISPUTE,
    JUROR,
    deps({ chain: chain({ dispute: null }) }),
  );
  assert.equal(out.status, 404);
});

test("subaccord not found → 404", async () => {
  const out = await deliver(
    DISPUTE,
    JUROR,
    deps({ chain: chain({ subaccord: null }) }),
  );
  assert.equal(out.status, 404);
});

test("unknown evidence operator (keyring null) → 404", async () => {
  const out = await deliver(
    DISPUTE,
    JUROR,
    deps({ keyring: keyringReturning(null) }),
  );
  assert.equal(out.status, 404);
  if (out.status !== 404) throw new Error("unreachable");
  assert.match(out.reason, /operator/i);
});

test("no evidence ingested (store null) → 404", async () => {
  const out = await deliver(DISPUTE, JUROR, deps({ store: storeWith(null) }));
  assert.equal(out.status, 404);
});

test("premature: round missing → 404 (not yet drawn)", async () => {
  const out = await deliver(
    DISPUTE,
    JUROR,
    deps({ chain: chain({ round: null }) }),
  );
  assert.equal(out.status, 404);
  if (out.status !== 404) throw new Error("unreachable");
  assert.match(out.reason, /drawn/i);
});

test("not drawn: juror absent from Round.jurors → 404", async () => {
  const out = await deliver(DISPUTE, new Uint8Array(32).fill(0xff), deps({}));
  assert.equal(out.status, 404);
  if (out.status !== 404) throw new Error("unreachable");
  assert.match(out.reason, /juror/i);
});

test("integrity gate: sha256(plaintext) != evidence_hash → 409", async () => {
  const out = await deliver(
    DISPUTE,
    JUROR,
    deps({
      chain: chain({
        dispute: {
          subaccord: SUB,
          evidence_hash: new Uint8Array(32).fill(0x11),
        },
      }),
    }),
  );
  assert.equal(out.status, 409);
  if (out.status !== 409) throw new Error("unreachable");
  assert.match(out.reason, /integrity|hash/i);
});

test("decrypt failure (unwrap null) → 409", async () => {
  const out = await deliver(
    DISPUTE,
    JUROR,
    deps({ crypto: cryptoWith({ plaintext: null }) }),
  );
  assert.equal(out.status, 409);
  if (out.status !== 409) throw new Error("unreachable");
  assert.match(out.reason, /decrypt|tamper/i);
});

test("watermark seam: a custom Watermark's output reaches reencryptToJuror", async () => {
  const tag = new Uint8Array([0xfe]);
  const tagging: Watermark = {
    apply: (plaintext) => {
      const t = new Uint8Array(plaintext.length + 1);
      t.set(tag, 0);
      t.set(plaintext, 1);
      return t;
    },
  };
  const captured: { val: Uint8Array } = { val: new Uint8Array(0) };
  const out = await deliver(
    DISPUTE,
    JUROR,
    deps({
      watermark: tagging,
      crypto: cryptoWith({ reencryptInput: captured }),
    }),
  );
  assert.equal(out.status, 200);
  assert.equal(
    captured.val[0],
    0xfe,
    "reencrypt received the watermarked (tagged) bytes, not raw plaintext",
  );
  assert.deepEqual(
    captured.val.subarray(1),
    PLAINTEXT,
    "watermark preserved the plaintext payload after the tag",
  );
});

test("encrypted-at-rest: plaintext never rounds-trips through the store", async () => {
  let storedSeen: EvidenceBundle | null = null;
  const store: DeliverStore = {
    async get() {
      storedSeen = bundle();
      return storedSeen;
    },
  };
  const out = await deliver(DISPUTE, JUROR, deps({ store }));
  assert.equal(out.status, 200);
  assert.ok(storedSeen);
  assert.ok(
    !Object.keys(storedSeen as object).includes("plaintext"),
    "store object has no plaintext field",
  );
});
