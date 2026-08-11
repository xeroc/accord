/**
 * evidence/evidence.test.ts — unit tests for the evidence module.
 *
 * Covers the HANDOFF §6 test matrix (unit-testable subset):
 *   - buildManifest: byte-stability (identical input → identical buffer + sha256)
 *   - deriveOptionHashes + verifyOptionHashes: correct pass, tampered throws
 *   - publishEvidence: stubbed-fetch 201, retry idempotent, non-201 throws
 *   - verifyManifestHash: accept on match, reject on mismatch
 *
 * Uses node:test (Node ≥ 18 built-in). No framework deps.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { ed25519PublicKeyFromSeed } from "@useaccord/sdk/evidence";
import type { Address } from "@solana/kit";

import {
  buildManifest,
  SHA256_ZERO,
  type ManifestCtx,
  type ManifestInput,
} from "./manifest.js";
import {
  deriveOptionHashes,
  generateSalt,
  verifyOptionHashes,
} from "./options.js";
import { publishEvidence, verifyManifestHash } from "./publish.js";

// --- helpers -----------------------------------------------------------------

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // ponytail: copy into ArrayBuffer-backed Uint8Array — TS 5.7+ subtle.digest
  // requires BufferSource<ArrayBuffer>, not <ArrayBufferLike>.
  const copy = new Uint8Array(data);
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", copy));
}

function makeInput(salt: Uint8Array): ManifestInput {
  return {
    title: "Milestone 3 — delivered?",
    labels: ["Not delivered", "Delivered as specified"],
    entries: [{ path: "https://example.com/claim.md" }],
    salt,
  };
}

/** Valid Ed25519 public key for the mock evidence operator. */
const OPERATOR_PUB = ed25519PublicKeyFromSeed(new Uint8Array(32).fill(42));

const CTX: ManifestCtx = {
  dispute: "DisputePubkey123456789" as Address,
  subaccord: "SubaccordPubkey1234" as Address,
  filer: "FilerPubkey123456789" as Address,
  filedAt: "2026-08-11T12:00:00Z",
};

// --- buildManifest: byte-stability -------------------------------------------

test("buildManifest: identical input → byte-identical buffer", () => {
  const salt = new Uint8Array(32).fill(42);
  const buf1 = buildManifest(makeInput(salt), CTX);
  const buf2 = buildManifest(makeInput(salt), CTX);
  assert.deepEqual(buf1, buf2);
});

test("buildManifest: byte-stability → sha256 stability", async () => {
  const salt = new Uint8Array(32).fill(42);
  const h1 = await sha256(buildManifest(makeInput(salt), CTX));
  const h2 = await sha256(buildManifest(makeInput(salt), CTX));
  assert.deepEqual(h1, h2);
});

test("buildManifest: different salt → different buffer", () => {
  const saltA = new Uint8Array(32).fill(1);
  const saltB = new Uint8Array(32).fill(2);
  const bufA = buildManifest(makeInput(saltA), CTX);
  const bufB = buildManifest(makeInput(saltB), CTX);
  assert.notDeepEqual(bufA, bufB);
});

test("buildManifest: SHA256_ZERO sentinel is 32 zero bytes", () => {
  assert.equal(SHA256_ZERO.length, 32);
  assert.ok(SHA256_ZERO.every((b) => b === 0));
});

test("buildManifest: entries default to SHA256_ZERO sentinel in YAML", () => {
  const salt = new Uint8Array(32).fill(0);
  const yaml = new TextDecoder().decode(buildManifest(makeInput(salt), CTX));
  const sentinel = "0".repeat(64);
  assert.ok(
    yaml.includes(sentinel),
    "YAML should contain the all-zero sha256 sentinel",
  );
});

// --- deriveOptionHashes + verifyOptionHashes --------------------------------

test("deriveOptionHashes → verifyOptionHashes: correct labels pass", async () => {
  const salt = generateSalt();
  const labels = ["Not delivered", "Delivered as specified"];
  const hashes = await deriveOptionHashes(salt, labels);
  assert.equal(hashes.length, labels.length);
  assert.equal(hashes[0]!.length, 32);
  await verifyOptionHashes(salt, labels, hashes); // should not throw
});

test("verifyOptionHashes: tampered label throws", async () => {
  const salt = generateSalt();
  const labels = ["Not delivered", "Delivered"];
  const hashes = await deriveOptionHashes(salt, labels);
  const tampered = ["Not delivered", "Not delivered"]; // swapped last label
  await assert.rejects(verifyOptionHashes(salt, tampered, hashes));
});

test("verifyOptionHashes: length mismatch throws", async () => {
  const salt = generateSalt();
  const labels = ["A", "B"];
  const hashes = await deriveOptionHashes(salt, labels);
  await assert.rejects(verifyOptionHashes(salt, ["A"], hashes));
});

test("deriveOptionHashes: invalid salt length throws", async () => {
  const shortSalt = new Uint8Array(16);
  await assert.rejects(deriveOptionHashes(shortSalt, ["A", "B"]));
});

// --- verifyManifestHash ------------------------------------------------------

test("verifyManifestHash: matching hash passes", async () => {
  const manifest = new TextEncoder().encode("test manifest bytes");
  const hash = await sha256(manifest);
  await verifyManifestHash(manifest, hash); // should not throw
});

test("verifyManifestHash: mismatched hash throws", async () => {
  const manifest = new TextEncoder().encode("test manifest bytes");
  const wrongHash = new Uint8Array(32).fill(99);
  await assert.rejects(verifyManifestHash(manifest, wrongHash));
});

// --- publishEvidence ---------------------------------------------------------

test("publishEvidence: encrypts + POSTs → 201", async () => {
  const manifest = buildManifest(makeInput(new Uint8Array(32).fill(1)), CTX);

  const fetchMock = mock.method(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(null, {
        status: 201,
        headers: { Location: "/evidence/s/d/0" },
      }),
    ),
  );

  try {
    await publishEvidence({
      endpoint: "https://evidence.test",
      subaccord: "SubAccord",
      dispute: "DisputeAddr",
      manifest,
      operatorPub: OPERATOR_PUB,
    });
    assert.equal(fetchMock.mock.callCount(), 1);

    // Verify the POST URL and body shape.
    const call = fetchMock.mock.calls[0]!;
    const url = call.arguments[0] as string;
    assert.equal(url, "https://evidence.test/evidence/SubAccord/DisputeAddr");

    const init = call.arguments[1] as RequestInit;
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body as string);
    assert.ok(body.ct, "body has ct");
    assert.ok(body.claimant_ephem_pub, "body has claimant_ephem_pub");
    assert.ok(body.wrapped, "body has wrapped");
    assert.ok(body.plaintext_hash, "body has plaintext_hash");
  } finally {
    fetchMock.mock.restore();
  }
});

test("publishEvidence: retry with same manifest → 201 idempotent", async () => {
  const operatorPub = OPERATOR_PUB;
  const manifest = buildManifest(makeInput(new Uint8Array(32).fill(1)), CTX);

  const fetchMock = mock.method(globalThis, "fetch", () =>
    Promise.resolve(new Response(null, { status: 201 })),
  );

  try {
    const args = {
      endpoint: "https://evidence.test",
      subaccord: "SubAccord",
      dispute: "DisputeAddr",
      manifest,
      operatorPub,
    };
    await publishEvidence(args);
    await publishEvidence(args); // retry — should not throw
    assert.equal(fetchMock.mock.callCount(), 2);
  } finally {
    fetchMock.mock.restore();
  }
});

test("publishEvidence: non-201 throws with daemon error", async () => {
  const operatorPub = OPERATOR_PUB;
  const manifest = new TextEncoder().encode("test");

  const fetchMock = mock.method(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: "plaintext_hash mismatch" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

  try {
    await assert.rejects(
      publishEvidence({
        endpoint: "https://evidence.test",
        subaccord: "SubAccord",
        dispute: "DisputeAddr",
        manifest,
        operatorPub,
      }),
      /400/,
    );
  } finally {
    fetchMock.mock.restore();
  }
});
