/**
 * evidence/publish.test.ts — recovery flow contract tests (accord-6fgl).
 *
 * Covers the three behaviors the detail-page "Publish evidence" recovery
 * relies on (HANDOFF §6):
 *
 *   1. verifyManifestHash — matching manifest passes; a wrong/tampered manifest
 *      is rejected (fails closed before any POST).
 *   2. publishEvidence — happy path POSTs a base64 bundle whose
 *      `plaintext_hash` is `sha256(manifest)` (i.e. the on-chain evidence_hash)
 *      and succeeds on daemon `201`.
 *   3. re-publish — calling publishEvidence again with the same manifest also
 *      succeeds (the daemon treats it as a `201` idempotent no-op on
 *      `plaintext_hash`; the call site must not throw on the second POST).
 *
 * Runner: `bun test` (same as apps/evidence-daemon). `fetch` is mocked; no live
 * daemon or chain is exercised — the daemon-side idempotency + on-chain hash
 * cross-check are owned by apps/evidence-daemon's own suite.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { getAddressDecoder } from "@solana/kit";
import { ed25519PublicKeyFromSeed, sha256 } from "@useaccord/sdk/evidence";

import { publishEvidence, verifyManifestHash } from "./publish";

const enc = new TextEncoder();
const rnd32 = () => crypto.getRandomValues(new Uint8Array(32));

/** base64 → bytes (mirrors the daemon's base64ToBytes for assertion decoding). */
function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A valid, random base58 operator address (Ed25519 pubkey → Address). */
function randomOperatorAddress(): string {
  return getAddressDecoder().decode(ed25519PublicKeyFromSeed(rnd32()));
}

/** A valid, random base58 address (for subaccord/dispute path params). */
function randomAddress(): string {
  return getAddressDecoder().decode(rnd32());
}

describe("verifyManifestHash", () => {
  test("matching manifest passes (no throw)", async () => {
    const manifest = enc.encode("schema: accord-evidence/v1\ntitle: t\n");
    const hash = await sha256(manifest);
    await verifyManifestHash(manifest, hash);
  });

  test("wrong manifest is rejected (fails closed)", async () => {
    const manifest = enc.encode("the real manifest");
    const otherHash = await sha256(enc.encode("something else"));
    await expect(verifyManifestHash(manifest, otherHash)).rejects.toThrow();
  });

  test("single-byte tamper is rejected", async () => {
    const manifest = enc.encode("the real manifest");
    const hash = await sha256(manifest);
    const tampered = new Uint8Array(manifest);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    await expect(verifyManifestHash(tampered, hash)).rejects.toThrow();
  });
});

describe("publishEvidence", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: ReturnType<typeof mock>;
  let operatorPub: string;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    operatorPub = randomOperatorAddress();
    fetchMock = mock(async () => new Response(null, { status: 201 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("happy path: POSTs base64 bundle; plaintext_hash == sha256(manifest)", async () => {
    const manifest = enc.encode("schema: accord-evidence/v1\n");
    const subaccord = randomAddress();
    const dispute = randomAddress();
    await publishEvidence({
      endpoint: "http://localhost:8080",
      subaccord,
      dispute,
      manifest,
      operatorPub,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    const url = String(call[0]);
    const init = call[1];
    expect(url).toBe(`http://localhost:8080/evidence/${subaccord}/${dispute}`);
    expect(init?.method).toBe("POST");
    const ct = init?.headers as Record<string, string>;
    expect(ct["content-type"]).toBe("application/json");

    const body = JSON.parse((init?.body as string) ?? "{}");
    for (const k of ["ct", "claimant_ephem_pub", "wrapped", "plaintext_hash"]) {
      expect(typeof body[k]).toBe("string");
      expect(body[k].length).toBeGreaterThan(0);
    }
    // plaintext_hash MUST equal sha256(manifest) — it is the on-chain
    // evidence_hash the daemon cross-checks (ingest.ts:142-144).
    const ph = b64ToBytes(body.plaintext_hash);
    const expected = await sha256(manifest);
    expect(Array.from(ph)).toEqual(Array.from(expected));
  });

  test("non-201 response throws", async () => {
    globalThis.fetch = mock(
      async () => new Response(null, { status: 500 }),
    ) as unknown as typeof globalThis.fetch;
    await expect(
      publishEvidence({
        endpoint: "http://localhost:8080",
        subaccord: randomAddress(),
        dispute: randomAddress(),
        manifest: enc.encode("x"),
        operatorPub,
      }),
    ).rejects.toThrow(/500/);
  });

  test("re-publish (recovery) is idempotent at the call site: two 201 POSTs, no throw", async () => {
    const manifest = enc.encode("the very same manifest bytes");
    const params = {
      endpoint: "http://localhost:8080",
      subaccord: randomAddress(),
      dispute: randomAddress(),
      manifest,
      operatorPub,
    };
    await publishEvidence(params); // first publish
    await publishEvidence(params); // re-publish after a transient failure
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Both POSTs carried identical plaintext_hash (the daemon dedupes on it).
    const bodies = fetchMock.mock.calls.map((c: unknown[]) => {
      const init = c[1] as RequestInit | undefined;
      return JSON.parse((init?.body as string) ?? "{}").plaintext_hash;
    });
    expect(bodies[0]).toBe(bodies[1]);
  });
});
