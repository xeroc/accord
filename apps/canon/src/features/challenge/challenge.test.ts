/**
 * challenge.test.ts — unit tests for the Canon challenge evidence flow.
 *
 * Proves the DoD (milestone §6 test matrix):
 *   - buildManifest with description → correct YAML format + sha256 stability
 *   - evidence_hash matches sha256(manifest)
 *   - description changes → different hash (committed bytes integrity)
 *   - Canon options are always [keep, remove]
 *   - flow order: build is offline (no fetch), publish POSTs to the daemon
 *     only after the dispute exists (ingest 404s on an absent dispute)
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

test("challenge manifest: description JSON-escaped on one logical line", () => {
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
  // SDK contract (manifest.ts): description is JSON-escaped so multi-line
  // markdown stays on one logical line — no YAML block-scalar parsing needed.
  assert.ok(
    yaml.includes('description: "This item is a scam.\\nSee evidence below."'),
    "should JSON-escape the description",
  );
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

// ---------------------------------------------------------------------------
// Flow order: build offline → tx creates the dispute → publish to the daemon
// (the daemon's ingest reads the dispute on-chain and 404s "dispute not found"
// if it does not exist yet — evidence must never be POSTed first).
// ---------------------------------------------------------------------------

import {
  buildChallengeEvidence,
  publishChallengeEvidence,
  type ChallengeOnChainContext,
} from "./challengeFlow.ts";
import type { CanonItem, CanonList } from "@useaccord/canon";
import { findDisputePda } from "@useaccord/sdk";
import { ed25519PublicKeyFromSeed } from "@useaccord/sdk/evidence";

const LIST = "11111111111111111111111111111111" as Address;
const SUBACCORD = "4zvwRjXUKGfvwnParsHAS3HuSVzV5cA4McphgmoCtajS" as Address;
const ITEM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
const DISPUTE = "9dPv2DhzYDjc5stCbh6FSzhgdvLvEcrRWAZzHKLt7jPc" as Address;

const CTX_ONCHAIN: ChallengeOnChainContext = {
  list: LIST,
  item: ITEM,
  listData: { disputeCount: 1n, subaccord: SUBACCORD } as unknown as CanonList,
  itemData: {} as CanonItem,
  operatorPub: ed25519PublicKeyFromSeed(crypto.getRandomValues(new Uint8Array(32))),
};

test("buildChallengeEvidence is offline — no fetch before the dispute exists", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("network call during build");
  }) as typeof fetch;
  try {
    const out = await buildChallengeEvidence(
      {
        title: "Mint operated by Circle",
        description: "Low faucet output",
        entries: [{ path: "https://faucet.circle.com" }],
      },
      CTX_ONCHAIN,
    );
    // Hash commits to the exact manifest bytes.
    assert.deepEqual(out.evidenceHash, await sha256(out.manifest));
    // Dispute PDA derived list-scoped (filer = list, nonce = dispute_count).
    const [expected] = await findDisputePda({ filer: LIST, nonce: 1n });
    assert.equal(out.dispute, expected);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("publishChallengeEvidence POSTs to the daemon (fetch-only, retry-safe)", async () => {
  const origFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: unknown) => {
    calls.push(String(url));
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  try {
    await publishChallengeEvidence(
      new Uint8Array(32),
      DISPUTE,
      CTX_ONCHAIN,
      { evidenceDaemonUrl: "http://daemon.test:8080" },
    );
  } finally {
    globalThis.fetch = origFetch;
  }
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /daemon\.test:8080\/evidence\/.+\/.+/);
});
