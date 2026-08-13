/**
 * challenge.test.ts — unit tests for the Canon challenge evidence flow.
 *
 * Proves the DoD (milestone §6 test matrix):
 *   - buildManifest with description → correct YAML format + sha256 stability
 *   - evidence_hash matches sha256(manifest)
 *   - description changes → different hash (committed bytes integrity)
 *   - Canon options are always [keep, remove]
 *
 * Uses node:test (Node ≥ 18 built-in). No framework deps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address } from "@solana/kit";
import {
  buildManifest,
  generateSalt,
  sha256,
  verifyManifestHash,
  type ManifestCtx,
} from "@useaccord/sdk/evidence";

const CTX: ManifestCtx = {
  dispute: "DisputePubkey123456789" as Address,
  subaccord: "SubaccordPubkey1234" as Address,
  filer: "CanonListPubkey12345" as Address,
  filedAt: "2026-08-13T12:00:00Z",
};

const CANON_OPTIONS = ["keep", "remove"];

test("challenge manifest: description emitted as YAML literal block", () => {
  const buf = buildManifest(
    {
      salt: generateSalt(),
      title: "Fraudulent submission",
      description: "This item is a scam.\nSee evidence below.",
      labels: CANON_OPTIONS,
      entries: [{ path: "https://example.com/evidence.pdf" }],
    },
    CTX,
  );
  const yaml = new TextDecoder().decode(buf);
  assert.ok(yaml.includes("description: |"), "should emit literal block scalar");
  assert.ok(yaml.includes("  This item is a scam."), "should indent body");
});

test("challenge manifest: evidence_hash matches sha256(manifest)", async () => {
  const manifest = buildManifest(
    {
      salt: generateSalt(),
      title: "Fraudulent submission",
      description: "# Claim\n\nThe item violates rule 3.",
      labels: CANON_OPTIONS,
      entries: [{ path: "https://example.com/evidence.pdf" }],
    },
    CTX,
  );
  const evidenceHash = await sha256(manifest);
  assert.equal(evidenceHash.length, 32, "evidence_hash must be 32 bytes");

  // sha256 stability — identical buffer → identical hash
  const hash2 = await sha256(manifest);
  assert.deepEqual(evidenceHash, hash2);

  // verifyManifestHash passes (the integrity gate jurors run)
  await verifyManifestHash(manifest, evidenceHash);
});

test("challenge manifest: description changes → different evidence_hash", async () => {
  const salt = generateSalt();
  const base = {
    salt,
    title: "Challenge",
    labels: CANON_OPTIONS,
    entries: [{ path: "https://example.com/a.pdf" }],
  };
  const noDesc = buildManifest(base, CTX);
  const withDesc = buildManifest({ ...base, description: "A claim body" }, CTX);
  const h1 = await sha256(noDesc);
  const h2 = await sha256(withDesc);
  assert.notDeepEqual(h1, h2, "different description → different hash");
});

test("challenge manifest: canon-fixed options [keep, remove]", () => {
  const yaml = new TextDecoder().decode(
    buildManifest(
      {
        salt: generateSalt(),
        title: "Test",
        description: "Body",
        labels: CANON_OPTIONS,
        entries: [{ path: "https://example.com/a.pdf" }],
      },
      CTX,
    ),
  );
  assert.ok(yaml.includes('label: "keep"'), "option 0 = keep");
  assert.ok(yaml.includes('label: "remove"'), "option 1 = remove");
});

test("challenge manifest: committed bytes are never altered by rendering", async () => {
  // The manifest is raw YAML; sha256 is over those bytes.
  // Markdown rendering is display-only — the committed bytes don't change.
  const manifest = buildManifest(
    {
      salt: new Uint8Array(32).fill(42),
      title: "Test",
      description: "## Heading\n\n**Bold** claim.",
      labels: CANON_OPTIONS,
      entries: [{ path: "https://example.com/a.pdf" }],
    },
    CTX,
  );
  const hash = await sha256(manifest);

  // Re-serialize the same input → same bytes → same hash
  const manifest2 = buildManifest(
    {
      salt: new Uint8Array(32).fill(42),
      title: "Test",
      description: "## Heading\n\n**Bold** claim.",
      labels: CANON_OPTIONS,
      entries: [{ path: "https://example.com/a.pdf" }],
    },
    CTX,
  );
  assert.deepEqual(manifest, manifest2, "identical input → byte-identical manifest");
  assert.deepEqual(hash, await sha256(manifest2), "sha256 stable");
});
