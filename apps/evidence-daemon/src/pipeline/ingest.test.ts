// ingest.test.ts — ingest pipeline v2 tests (milestone accord-5d0r).
//
// v2 adds a decrypt-and-verify gate at POST (the daemon holds the operator
// keyring — this is bean accord-vknh's planned gate landing): after the v1
// metadata gates, the manifest bundle must decrypt, hash to its own
// plaintext_hash, parse, and pass entry validation (schema dispatch, path
// hygiene, uniqueness, limits). Ports are faked; real ECIES is covered by the
// SDK self-check and tests/wire.test.ts.
//
// Run: `pnpm --filter @useaccord/evidence-daemon test` (→ bun test).

import { describe, expect, test } from "bun:test";
import { sha256 } from "@useaccord/sdk/evidence";
import {
  type EvidenceBundle,
  ingest,
  type IngestChainReader,
  type IngestCrypto,
  type IngestDeps,
  type IngestKeyring,
  type IngestStore,
  ingestFile,
} from "./ingest.js";

const enc = new TextEncoder();

const SUBACCORD = new Uint8Array(32).fill(1);
const DISPUTE = new Uint8Array(32).fill(2);
const OPERATOR = new Uint8Array(32).fill(3);
const OPERATOR_SK = new Uint8Array(32).fill(4);

const HEX32 = "ab".repeat(32);
const SENTINEL = "0".repeat(64);

/** In-memory IngestStore: manifest objects + per-file objects. */
class MemStore implements IngestStore {
  readonly manifests = new Map<string, EvidenceBundle>();
  readonly files = new Map<string, EvidenceBundle>();
  exists(sa: Uint8Array, d: Uint8Array, round: number): Promise<boolean> {
    return Promise.resolve(this.manifests.has(`${round}`));
  }
  get(sa: Uint8Array, d: Uint8Array, round: number): Promise<EvidenceBundle | null> {
    return Promise.resolve(this.manifests.get(`${round}`) ?? null);
  }
  put(b: EvidenceBundle): Promise<void> {
    this.manifests.set(`${b.round}`, b);
    return Promise.resolve();
  }
  putFile(b: EvidenceBundle, path: string): Promise<void> {
    this.files.set(`${b.round}/${path}`, b);
    return Promise.resolve();
  }
  getFile(
    sa: Uint8Array,
    d: Uint8Array,
    round: number,
    path: string,
  ): Promise<EvidenceBundle | null> {
    return Promise.resolve(this.files.get(`${round}/${path}`) ?? null);
  }
  async listFiles(
    sa: Uint8Array,
    d: Uint8Array,
    round: number,
  ): Promise<{ path: string; bytes: number }[]> {
    return [...this.files.entries()]
      .filter(([k]) => k.startsWith(`${round}/`))
      .map(([k, b]) => ({ path: k.slice(2), bytes: b.ct.length }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }
}

/** Fake crypto: ct IS the plaintext; unwrap fails on a 0xff first byte. */
const crypto: IngestCrypto = {
  sha256: (d) => sha256(d),
  async unwrap(bundle) {
    if (bundle.ct[0] === 0xff) return null;
    return { plaintext: bundle.ct };
  },
};

const keyring: IngestKeyring = {
  async forOperator(pub) {
    let eq = pub.length === OPERATOR.length;
    for (let i = 0; eq && i < pub.length; i++) eq = pub[i] === OPERATOR[i];
    return eq ? OPERATOR_SK : null;
  },
};

/** Minimal manifest YAML the SDK parser accepts. */
function manifestYAML(schema: string, entries: { path: string; sha256: string }[]): Uint8Array {
  const lines = [`schema: ${schema}`, "entries:"];
  for (const e of entries) lines.push(`  - { path: "${e.path}", sha256: "${e.sha256}" }`);
  return enc.encode(lines.join("\n") + "\n");
}

async function bundleFor(plaintext: Uint8Array, round = 0): Promise<EvidenceBundle> {
  return {
    subaccord: SUBACCORD,
    dispute: DISPUTE,
    round,
    ct: plaintext,
    claimant_ephem_pub: new Uint8Array(32).fill(9),
    wrapped: new Uint8Array(32).fill(7),
    plaintext_hash: await sha256(plaintext),
    ingested_at: 0,
  };
}

async function rig(manifest: Uint8Array, over: Partial<Parameters<typeof ingest>[4]> = {}) {
  const store = new MemStore();
  const chain: IngestChainReader = {
    async readDispute() {
      return { subaccord: SUBACCORD, evidence_hashes: [await sha256(manifest)] };
    },
    async readSubaccord() {
      return { evidence_operator: OPERATOR };
    },
  };
  const deps: IngestDeps = {
    store,
    chain,
    keyring,
    crypto,
    limits: { maxEntries: 64, maxDocBytes: 10_000_000, maxPackageBytes: 100_000_000 },
    ...over,
  };
  return { store, deps, bundle: await bundleFor(manifest) };
}

describe("ingest v2 — decrypt-verify + dispatch (accord-5d0r)", () => {
  test("v1 manifest with NO entries → 201, stored (manifest-only back-compat)", async () => {
    const { deps, bundle } = await rig(manifestYAML("accord-evidence/v1", []));
    const out = await ingest(SUBACCORD, DISPUTE, 0, bundle, deps);
    expect(out).toEqual({ status: 201, idempotent: false });
    expect(await deps.store.get(SUBACCORD, DISPUTE, 0)).not.toBeNull();
  });

  test("riprap-claim/v1 with real-leaf entries → 201", async () => {
    const m = manifestYAML("riprap-claim/v1", [
      { path: "01-ticket.pdf", sha256: HEX32 },
      { path: "02-id.jpg", sha256: "cd".repeat(32) },
    ]);
    const { deps, bundle } = await rig(m);
    const out = await ingest(SUBACCORD, DISPUTE, 0, bundle, deps);
    expect(out).toEqual({ status: 201, idempotent: false });
  });

  test("unknown schema WITH entries → 400, nothing stored", async () => {
    const m = manifestYAML("typo-scheme/v1", [{ path: "a.pdf", sha256: HEX32 }]);
    const { deps, bundle } = await rig(m);
    const out = await ingest(SUBACCORD, DISPUTE, 0, bundle, deps);
    expect(out.status).toBe(400);
    expect(out.status === 400 && out.reason).toMatch(/unknown multifile schema/i);
    expect(await deps.store.get(SUBACCORD, DISPUTE, 0)).toBeNull();
  });

  test("undecryptable bundle (tampered ct) → 400, nothing stored", async () => {
    const m = manifestYAML("riprap-claim/v1", []);
    const { deps } = await rig(m);
    // raw 0xff first byte — the fake crypto's undecryptable marker
    const bundle = await bundleFor(new Uint8Array([0xff, 1, 2, 3, 4]));
    const out = await ingest(SUBACCORD, DISPUTE, 0, bundle, deps);
    expect(out.status).toBe(400);
    expect(await deps.store.get(SUBACCORD, DISPUTE, 0)).toBeNull();
  });

  test("decrypt-verify mismatch: ct ≠ plaintext_hash (chain gate passes) → 400", async () => {
    const lyingHash = await sha256(enc.encode("DIFFERENT plaintext"));
    const { deps } = await rig(manifestYAML("riprap-claim/v1", []), {
      chain: {
        readDispute: async () => ({ subaccord: SUBACCORD, evidence_hashes: [lyingHash] }),
        readSubaccord: async () => ({ evidence_operator: OPERATOR }),
      },
    });
    // ct decrypts to "honest plaintext" but the bundle (and the chain slot)
    // claim a different hash — the exact lie this gate exists to catch.
    const bundle = await bundleFor(enc.encode("honest plaintext"));
    bundle.plaintext_hash = lyingHash;
    const out = await ingest(SUBACCORD, DISPUTE, 0, bundle, deps);
    expect(out.status).toBe(400);
    expect(out.status === 400 && out.reason).toMatch(/decrypt-verify/i);
  });

  test("garbage plaintext with NO entries → 201 manifest-only (claimant committed those bytes)", async () => {
    const raw = enc.encode("\x00\x01 not yaml at all \xff no entries section");
    const { deps, bundle } = await rig(raw);
    const out = await ingest(SUBACCORD, DISPUTE, 0, bundle, deps);
    expect(out).toEqual({ status: 201, idempotent: false });
  });

  test("unknown operator (keyring miss) → 400, nothing stored", async () => {
    const m = manifestYAML("riprap-claim/v1", []);
    const { deps, bundle } = await rig(m);
    const out = await ingest(SUBACCORD, DISPUTE, 0, bundle, {
      ...deps,
      keyring: { forOperator: async () => null },
    });
    expect(out.status).toBe(400);
    expect(await deps.store.get(SUBACCORD, DISPUTE, 0)).toBeNull();
  });

  test("unsafe tracked path in entries → 400", async () => {
    for (const bad of ["../escape.pdf", "/abs.pdf", "a\\b.pdf", "a//b.pdf"]) {
      const m = manifestYAML("riprap-claim/v1", [{ path: bad, sha256: HEX32 }]);
      const { deps, bundle } = await rig(m);
      const out = await ingest(SUBACCORD, DISPUTE, 0, bundle, deps);
      expect(out.status).toBe(400);
      expect(out.status === 400 && out.reason).toMatch(/unsafe entry path/i);
    }
  });

  test("duplicate tracked paths → 400", async () => {
    const m = manifestYAML("riprap-claim/v1", [
      { path: "a.pdf", sha256: HEX32 },
      { path: "a.pdf", sha256: "cd".repeat(32) },
    ]);
    const { deps, bundle } = await rig(m);
    const out = await ingest(SUBACCORD, DISPUTE, 0, bundle, deps);
    expect(out.status).toBe(400);
    expect(out.status === 400 && out.reason).toMatch(/duplicate/i);
  });

  test("entry count over the limit → 400", async () => {
    const m = manifestYAML(
      "riprap-claim/v1",
      Array.from({ length: 3 }, (_, i) => ({ path: `f${i}.pdf`, sha256: HEX32 })),
    );
    const { deps, bundle } = await rig(m, {
      limits: { maxEntries: 2, maxDocBytes: 1e9, maxPackageBytes: 1e9 },
    });
    const out = await ingest(SUBACCORD, DISPUTE, 0, bundle, deps);
    expect(out.status).toBe(400);
    expect(out.status === 400 && out.reason).toMatch(/too many entries/i);
  });

  test("malformed leaf sha256 (not 64 lowercase hex) → 400", async () => {
    for (const bad of ["XYZ", "AA".repeat(32), `${HEX32.slice(0, 63)}`]) {
      const m = manifestYAML("riprap-claim/v1", [{ path: "a.pdf", sha256: bad }]);
      const { deps, bundle } = await rig(m);
      const out = await ingest(SUBACCORD, DISPUTE, 0, bundle, deps);
      expect(out.status).toBe(400);
      expect(out.status === 400 && out.reason).toMatch(/sha256/i);
    }
  });

  test("URL and sentinel entries are accepted unvalidated (born satisfied)", async () => {
    const m = manifestYAML("riprap-claim/v1", [
      { path: "https://example.com/x.pdf", sha256: SENTINEL },
      { path: "out-of-band.bin", sha256: SENTINEL },
    ]);
    const { deps, bundle } = await rig(m);
    const out = await ingest(SUBACCORD, DISPUTE, 0, bundle, deps);
    expect(out).toEqual({ status: 201, idempotent: false });
  });

  test("idempotent re-POST of the same manifest → 201 idempotent", async () => {
    const m = manifestYAML("riprap-claim/v1", [{ path: "a.pdf", sha256: HEX32 }]);
    const { deps, bundle } = await rig(m);
    expect(await ingest(SUBACCORD, DISPUTE, 0, bundle, deps)).toEqual({
      status: 201,
      idempotent: false,
    });
    expect(await ingest(SUBACCORD, DISPUTE, 0, bundle, deps)).toEqual({
      status: 201,
      idempotent: true,
    });
  });

  test("v1 gates still fire first: dispute missing → 404 despite garbage bundle", async () => {
    const { deps, bundle } = await rig(manifestYAML("x", []), {
      chain: { readDispute: async () => null, readSubaccord: async () => null },
    });
    const out = await ingest(SUBACCORD, DISPUTE, 0, bundle, deps);
    expect(out).toEqual({ status: 404, reason: "dispute not found" });
  });
});

describe("ingestFile — PUT /evidence/.../round/path (accord-5d0r)", () => {
  const DOC_A = enc.encode("ticket pdf bytes");
  const DOC_B = enc.encode("id document jpg bytes");

  /** Rig with a riprap manifest (2 tracked entries) already POSTed + stored. */
  async function rigStored(over: Partial<Parameters<typeof ingest>[4]> = {}) {
    const leafA = await sha256(DOC_A);
    const leafB = await sha256(DOC_B);
    const hex = (b: Uint8Array) =>
      Array.from(b)
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
    const m = manifestYAML("riprap-claim/v1", [
      { path: "01-ticket.pdf", sha256: hex(leafA) },
      { path: "02-id.jpg", sha256: hex(leafB) },
    ]);
    const r = await rig(m, over);
    const posted = await ingest(SUBACCORD, DISPUTE, 0, r.bundle, r.deps);
    if (posted.status !== 201) throw new Error(`manifest POST failed: ${JSON.stringify(posted)}`);
    return r;
  }

  test("happy → 201, stored under the entry path", async () => {
    const { deps } = await rigStored();
    const doc = await bundleFor(DOC_A);
    const out = await ingestFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf", doc, deps);
    expect(out).toEqual({ status: 201, idempotent: false });
    expect(await deps.store.getFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf")).not.toBeNull();
  });

  test("manifest-first: no manifest stored → 404", async () => {
    const m = manifestYAML("riprap-claim/v1", []);
    const { deps } = await rig(m); // NOT ingested — store empty
    const doc = await bundleFor(DOC_A);
    const out = await ingestFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf", doc, deps);
    expect(out.status).toBe(404);
    expect(out.status === 404 && out.reason).toMatch(/manifest/i);
  });

  test("path not tracked in manifest → 400", async () => {
    const { deps } = await rigStored();
    const doc = await bundleFor(DOC_A);
    const out = await ingestFile(SUBACCORD, DISPUTE, 0, "99-unknown.pdf", doc, deps);
    expect(out.status).toBe(400);
    expect(out.status === 400 && out.reason).toMatch(/not tracked/i);
  });

  test("URL/sentinel entries are not uploadable → 400 not tracked", async () => {
    const m = manifestYAML("riprap-claim/v1", [
      { path: "https://example.com/x.pdf", sha256: SENTINEL },
      { path: "out-of-band.bin", sha256: SENTINEL },
    ]);
    const { deps, bundle } = await rig(m);
    expect((await ingest(SUBACCORD, DISPUTE, 0, bundle, deps)).status).toBe(201);
    const doc = await bundleFor(DOC_A);
    const out = await ingestFile(SUBACCORD, DISPUTE, 0, "out-of-band.bin", doc, deps);
    expect(out.status).toBe(400);
  });

  test("leaf mismatch → 400 WITHOUT decrypting (hash gate precedes decrypt)", async () => {
    const { deps } = await rigStored();
    // 0xff-first ct would also fail decrypt, but the leaf gate must fire first
    const doc = await bundleFor(new Uint8Array([0xff, 1, 2, 3]));
    const out = await ingestFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf", doc, deps);
    expect(out.status).toBe(400);
    expect(out.status === 400 && out.reason).toMatch(/manifest leaf|plaintext_hash/i);
  });

  test("undecryptable doc with CORRECT leaf hash → 400", async () => {
    // raw 0xff first byte — the fake crypto's undecryptable marker
    const corrupt = new Uint8Array([0xff, 9, 9, 9]);
    const doc = await bundleFor(corrupt);
    const hex = Array.from(doc.plaintext_hash)
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    // manifest leaf matches this doc's hash, so only decrypt can fail
    const m = manifestYAML("riprap-claim/v1", [{ path: "01-ticket.pdf", sha256: hex }]);
    const r2 = await rig(m);
    await ingest(SUBACCORD, DISPUTE, 0, r2.bundle, r2.deps);
    const out = await ingestFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf", doc, r2.deps);
    expect(out.status).toBe(400);
    expect(out.status === 400 && out.reason).toMatch(/undecryptable/i);
  });

  test("decrypt-verify mismatch: ct ≠ leaf → 400", async () => {
    // manifest leaf (rigStored) = sha256(DOC_A) ≠ this hash → actually the leaf
    // gate catches it; to isolate decrypt-verify we need leaf == lying hash:
    const doc = await bundleFor(DOC_A);
    doc.plaintext_hash = await sha256(enc.encode("different bytes"));
    const lying = doc.plaintext_hash;
    const hex = Array.from(lying)
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    const m = manifestYAML("riprap-claim/v1", [{ path: "01-ticket.pdf", sha256: hex }]);
    const r2 = await rig(m);
    await ingest(SUBACCORD, DISPUTE, 0, r2.bundle, r2.deps);
    const out = await ingestFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf", doc, r2.deps);
    expect(out.status).toBe(400);
    expect(out.status === 400 && out.reason).toMatch(/decrypt-verify/i);
  });

  test("idempotent re-PUT same hash → 201 idempotent; divergent stored hash → 409", async () => {
    const { deps } = await rigStored();
    const doc = await bundleFor(DOC_A);
    expect(await ingestFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf", doc, deps)).toEqual({
      status: 201,
      idempotent: false,
    });
    expect(await ingestFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf", doc, deps)).toEqual({
      status: 201,
      idempotent: true,
    });
    // A different hash at the path can only arise from storage divergence
    // (the leaf gate pins honest uploads to one hash) — seed it directly.
    const divergent = await bundleFor(DOC_B);
    await deps.store.putFile(
      { ...divergent, plaintext_hash: new Uint8Array(32).fill(0x77) },
      "02-id.jpg",
    );
    const out = await ingestFile(SUBACCORD, DISPUTE, 0, "02-id.jpg", divergent, deps);
    expect(out.status).toBe(409);
  });

  test("per-doc cap → 413", async () => {
    const { deps } = await rigStored({
      limits: { maxEntries: 64, maxDocBytes: 4, maxPackageBytes: 1e9 },
    });
    const doc = await bundleFor(DOC_A);
    const out = await ingestFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf", doc, deps);
    expect(out.status).toBe(413);
  });

  test("package cumulative cap → 413", async () => {
    const { deps } = await rigStored({
      limits: { maxEntries: 64, maxDocBytes: 1e9, maxPackageBytes: DOC_A.length + 1 },
    });
    const a = await bundleFor(DOC_A);
    expect((await ingestFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf", a, deps)).status).toBe(201);
    const b = await bundleFor(DOC_B);
    const out = await ingestFile(SUBACCORD, DISPUTE, 0, "02-id.jpg", b, deps);
    expect(out.status).toBe(413);
  });

  test("unsafe path → 400 before any store access", async () => {
    const { deps } = await rigStored();
    const doc = await bundleFor(DOC_A);
    for (const p of ["../x", "/x", "a\\b", "a//b"]) {
      const out = await ingestFile(SUBACCORD, DISPUTE, 0, p, doc, deps);
      expect(out.status).toBe(400);
    }
  });
});
