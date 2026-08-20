// domain.test.ts — PUT/GET /domains/{hash} contract suite (beans accord-49b3,
// accord-lbst).
//
// Drives createApp over the REAL domain pipeline (pipeline/domain.ts) wired to
// a real FsDomainStore in a temp dir — the full HTTP contract of the public
// document CAS (ADR-0027 as amended, milestone §6 Test Matrix): 201 create,
// 200 idempotent no-op, 409 collision, 400 hash mismatch / malformed hex, 413
// over-cap, 404 unknown, content-type default + passthrough, ETag +
// Cache-Control immutable. Evidence handlers are stubs — this suite owns the
// domain namespace only.
//
// Chain-anchored PUT (accord-lbst): every PUT carries ?subaccord=<addr>; the
// pipeline resolves the anchor Subaccord via an injected reader seam (with a
// poll budget for commitment lag) and requires domain_ref == hash. Gate
// matrix: no param → 400, malformed param → 400, anchor never appears → 404,
// domain_ref mismatch → 400, anchor appears late → accepted.
//
// Run: `pnpm --filter @useaccord/evidence-daemon test` (→ bun test).

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadServerConfig } from "../config.js";
import { FsDomainStore } from "../store/domain-fs.js";
import { DEFAULT_DOMAIN_CONTENT_TYPE } from "../store/domain.js";
import { getDomain, putDomain, type DomainAnchorReader } from "../pipeline/domain.js";
import { createApp } from "./app.js";
import type { ServerDeps } from "./handlers.js";
import type { KeyringPublicKeys } from "./public-keys.js";

const ADDR = "1".repeat(32);
const STUB_PUBLIC_KEYS: KeyringPublicKeys = {
  operators: [{ base58: ADDR, hex: "ff".repeat(32) }],
};

const MAX_DOMAIN_BYTES = loadServerConfig({}).maxDomainBytes; // default 1 MiB

/** Anchor Subaccord address used by every PUT the `put()` helper builds. */
const SUB = "2".repeat(32);

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "domain-routes-"));
  anchorRefs.clear(); // fresh chain per test — no cross-test anchor leakage
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

/** sha256 hex of bytes (Bun-native; matches the pipeline's digest). */
function sha256Hex(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

/** 64-char lowercase hex → 32 raw bytes. */
function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

// Anchor fixture: subaccord → domain_ref hex. `put()` auto-anchors the doc's
// hash (the honest-author default); gate tests override via setAnchor/opts.
const anchorRefs = new Map<string, string>();

function setAnchor(subaccord: string, domainRefHex: string | null): void {
  if (domainRefHex === null) anchorRefs.delete(subaccord);
  else anchorRefs.set(subaccord, domainRefHex);
}

const mapAnchor: DomainAnchorReader = async (sa) => {
  const h = anchorRefs.get(sa);
  return h === undefined ? null : hexToBytes(h);
};

interface MakeAppOpts {
  /** PUT body cap (default: server default). */
  maxBytes?: number;
  /** Anchor poll budget; tests shrink it so exhaustion runs in ms. */
  anchorPollMs?: number;
  /** Injected anchor reader seam (chain/reader in production). */
  anchor?: DomainAnchorReader;
}

/** App with the real domain pipeline over an FsDomainStore; evidence stubbed. */
function makeApp(opts: MakeAppOpts = {}) {
  const store = new FsDomainStore({ rootDir });
  const anchor = opts.anchor ?? mapAnchor;
  const deps: ServerDeps = {
    ingest: async () => ({ ok: true, status: 201, location: "/evidence/s/d" }),
    synodIngest: async () => ({ ok: true, status: 201, location: "/evidence/synod/c/0" }),
    synodManifest: async () => ({
      ok: true,
      status: 200,
      body: { party_count: 0, parties: [], verified: null },
    }),
    deliver: async () => ({ ok: true, status: 200, body: { rounds: [] } }),
    manifest: async () => ({ ok: true, status: 200, body: {} }),
    health: async () => ({ ok: true }),
    publicKeys: STUB_PUBLIC_KEYS,
    // Same outcome→result mapping wire.ts applies (pipeline ⇒ handler shape).
    domainPut: async (hash, bytes, contentType, subaccord) => {
      const out = await putDomain(hash, bytes, contentType, subaccord, {
        store,
        maxBytes: opts.maxBytes ?? MAX_DOMAIN_BYTES,
        sha256: sdkSha256,
        readAnchor: anchor,
        anchorPollMs: opts.anchorPollMs ?? 25,
      });
      return out.status === 200 || out.status === 201
        ? { ok: true, status: out.status }
        : { ok: false, status: out.status, error: out.reason };
    },
    domainGet: async (hash) => {
      const out = await getDomain(hash, { store });
      return out.status === 200
        ? { ok: true, status: 200, bytes: out.bytes, contentType: out.contentType }
        : { ok: false, status: out.status, error: out.reason };
    },
  };
  return createApp(deps);
}

/** SDK evidence sha256 (what wire.ts injects) — bytes in, 32 bytes out. */
async function sdkSha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(new Bun.CryptoHasher("sha256").update(data).digest());
}

const DOC = new TextEncoder().encode("# Rules\n\nBe excellent to each other.\n");

function put(hash: string, body: Uint8Array, contentType?: string, subaccord = SUB): Request {
  // Auto-anchor: an honest author creates the Subaccord with domain_ref =
  // sha256(doc) before publishing. Gate tests override AFTER/BEFORE this.
  if (!anchorRefs.has(subaccord)) anchorRefs.set(subaccord, hash);
  return new Request(`http://x/domains/${hash}?subaccord=${subaccord}`, {
    method: "PUT",
    body,
    ...(contentType ? { headers: { "content-type": contentType } } : {}),
  });
}

function get(hash: string): Request {
  return new Request(`http://x/domains/${hash}`);
}

describe("PUT /domains/:hash — CAS semantics (anchor satisfied)", () => {
  it("correct bytes → 201 + Location; GET returns identical bytes + content-type", async () => {
    const app = makeApp();
    const hash = sha256Hex(DOC);
    const res = await app.request(put(hash, DOC, "text/markdown; charset=utf-8"));
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe(`/domains/${hash}`);

    const got = await app.request(get(hash));
    expect(got.status).toBe(200);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(DOC);
    expect(got.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(got.headers.get("etag")).toBe(hash);
    expect(got.headers.get("cache-control")).toBe("immutable");
  });

  it("content-type defaults to text/markdown when the PUT omits it", async () => {
    const app = makeApp();
    const hash = sha256Hex(DOC);
    expect((await app.request(put(hash, DOC))).status).toBe(201);
    const got = await app.request(get(hash));
    expect(got.headers.get("content-type")).toBe(DEFAULT_DOMAIN_CONTENT_TYPE);
  });

  it("identical bytes re-PUT → 200 no-op (store untouched)", async () => {
    const app = makeApp();
    const hash = sha256Hex(DOC);
    expect((await app.request(put(hash, DOC))).status).toBe(201);
    const res = await app.request(put(hash, DOC));
    expect(res.status).toBe(200);
    // Still served, original object intact.
    const got = await app.request(get(hash));
    expect(got.status).toBe(200);
  });

  it("different bytes at the same hash → 409 (collision alarm)", async () => {
    const app = makeApp();
    const hash = sha256Hex(DOC);
    // Pre-seed the store with DIFFERENT bytes at the doc's hash — the only
    // way different bytes can sit at one hash is a sha256 collision/tamper.
    const store = new FsDomainStore({ rootDir });
    await store.put({
      hash,
      bytes: new TextEncoder().encode("different"),
      contentType: "text/plain",
    });
    const res = await app.request(put(hash, DOC));
    expect(res.status).toBe(409);
  });

  it("body whose sha256 ≠ route hash → 400", async () => {
    const app = makeApp();
    const wrongHash = sha256Hex(new TextEncoder().encode("not the doc"));
    const res = await app.request(put(wrongHash, DOC));
    expect(res.status).toBe(400);
  });

  it("malformed hash (not 64 lowercase hex) → 400", async () => {
    const app = makeApp();
    expect((await app.request(put("XYZ", DOC))).status).toBe(400);
    expect((await app.request(put("AB".repeat(32), DOC))).status).toBe(400); // uppercase
    expect((await app.request(put("ab".repeat(31), DOC))).status).toBe(400); // 63 chars
  });

  it("over-cap body → 413 before any store write", async () => {
    const app = makeApp({ maxBytes: 4 }); // tiny cap for the test
    const bytes = new Uint8Array(5); // any bytes — cap check precedes hash check
    const res = await app.request(put("ab".repeat(32), bytes));
    expect(res.status).toBe(413);
    expect((await app.request(get("ab".repeat(32)))).status).toBe(404); // never stored
  });

  it("binary (non-UTF-8) bytes round-trip byte-exact", async () => {
    const app = makeApp();
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const hash = sha256Hex(bytes);
    await app.request(put(hash, bytes, "application/octet-stream"));
    const got = await app.request(get(hash));
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes);
  });
});

describe("PUT /domains/:hash — anchor gate (accord-lbst)", () => {
  it("missing ?subaccord → 400", async () => {
    const app = makeApp();
    const hash = sha256Hex(DOC);
    const res = await app.request(
      new Request(`http://x/domains/${hash}`, { method: "PUT", body: DOC }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("subaccord");
  });

  it("malformed ?subaccord → 400", async () => {
    const app = makeApp();
    const hash = sha256Hex(DOC);
    const res = await app.request(
      new Request(`http://x/domains/${hash}?subaccord=not-an-address`, {
        method: "PUT",
        body: DOC,
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("subaccord");
  });

  it("anchor never appears within the poll budget → 404 (anchor not found)", async () => {
    const app = makeApp({ anchorPollMs: 20 });
    const hash = sha256Hex(DOC);
    // Manual request (no put()) — the auto-anchor fixture must not fire.
    const res = await app.request(
      new Request(`http://x/domains/${hash}?subaccord=${"3".repeat(32)}`, {
        method: "PUT",
        body: DOC,
      }),
    );
    expect(res.status).toBe(404);
    // Nothing stored — the gate precedes the write.
    expect((await app.request(get(hash))).status).toBe(404);
  });

  it("anchor domain_ref ≠ route hash → 400", async () => {
    const app = makeApp();
    const hash = sha256Hex(DOC);
    setAnchor(SUB, sha256Hex(new TextEncoder().encode("some other doc")));
    const res = await app.request(put(hash, DOC));
    expect(res.status).toBe(400);
    expect((await app.request(get(hash))).status).toBe(404); // never stored
  });

  it("anchor appears after commitment lag → poll retries → 201", async () => {
    const hash = sha256Hex(DOC);
    let calls = 0;
    const app = makeApp({
      anchorPollMs: 500,
      // First read (pre-commitment) misses; the retry inside the budget hits.
      anchor: async () => (calls++ === 0 ? null : hexToBytes(hash)),
    });
    const res = await app.request(put(hash, DOC));
    expect(res.status).toBe(201);
    expect(calls).toBe(2);
    expect((await app.request(get(hash))).status).toBe(200);
  });

  it("idempotent re-PUT still passes the gate (anchor exists by construction)", async () => {
    const app = makeApp();
    const hash = sha256Hex(DOC);
    expect((await app.request(put(hash, DOC))).status).toBe(201);
    expect((await app.request(put(hash, DOC))).status).toBe(200);
  });
});

describe("GET /domains/:hash", () => {
  it("unknown hash → 404", async () => {
    const app = makeApp();
    const res = await app.request(get("ab".repeat(32)));
    expect(res.status).toBe(404);
  });

  it("malformed hash → 400", async () => {
    const app = makeApp();
    // NB: "../x" can't reach the route — URL path normalization resolves it
    // client-side; the route-level guard covers shape ("nothex" below).
    expect((await app.request(get("nothex"))).status).toBe(400);
  });
});
