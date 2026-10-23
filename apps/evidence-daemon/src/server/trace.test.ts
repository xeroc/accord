// trace.test.ts — POST /trace/{subaccord}/{dispute}/{juror} contract suite
// (beans accord-lmcc + accord-sith, ADR-0037).
//
// Drives createApp over the REAL trace pipeline (pipeline/trace.ts) wired to a
// real FsTraceStore in a temp dir, REAL Ed25519 batch signatures
// (@useaccord/sdk/evidence buildTraceBatchMessage), and a stubbed live-Round
// chain reader: disabled 404, address guards 400, body-cap 413 (256 KiB),
// envelope shape 400 / events-cap 413 (64), bad sig 403, non-drawn juror 403,
// stale seq 200 idempotent no-op, gap accepted, happy 201 + durable append +
// fan-out, store write failure still fans out. Evidence handlers are stubs —
// this suite owns the trace namespace only.
//
// Run: `pnpm --filter @useaccord/evidence-daemon test` (→ bun test).

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { address, type Address } from "@solana/kit";
import { ed25519 } from "@noble/curves/ed25519";
import { buildTraceBatchMessage } from "@useaccord/sdk/evidence";
import bs58 from "bs58";

import { loadServerConfig } from "../config.js";
import { FsTraceStore } from "../store/trace-fs.js";
import type { TraceBatch, TraceStore } from "../store/trace.js";
import { ingestTrace, type TraceChainReader } from "../pipeline/trace.js";
import { createApp } from "./app.js";
import type { ServerDeps } from "./handlers.js";
import type { KeyringPublicKeys } from "./public-keys.js";

const SUB: Address = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const DISPUTE: Address = address("11111111111111111111111111111111");

// The drawn juror: a real Ed25519 keypair so signatures verify end-to-end.
const JUROR_SEED = new Uint8Array(32).fill(7);
const JUROR_PUB = ed25519.getPublicKey(JUROR_SEED);
const JUROR: Address = address(bs58.encode(JUROR_PUB));
// A second, NON-drawn juror key.
const OUTSIDER_SEED = new Uint8Array(32).fill(9);
const OUTSIDER_PUB = ed25519.getPublicKey(OUTSIDER_SEED);
const OUTSIDER: Address = address(bs58.encode(OUTSIDER_PUB));

const STUB_PUBLIC_KEYS: KeyringPublicKeys = {
  operators: [{ base58: "1".repeat(32), hex: "ff".repeat(32) }],
};

let rootDir: string;
let store: TraceStore;
let fanned: TraceBatch[];

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "trace-routes-"));
  store = new FsTraceStore({ rootDir });
  fanned = [];
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

/** Round stub: the dispute's current round holds exactly the drawn jurors. */
function chainWith(jurors: Uint8Array[] | null): TraceChainReader {
  return {
    async readRound(d) {
      if (!bs58.encode(d) || bs58.encode(d) !== DISPUTE) return null;
      return jurors === null ? null : { jurors };
    },
  };
}

interface MakeAppOpts {
  readonly traceEnabled?: boolean;
  readonly chain?: TraceChainReader;
  readonly store?: TraceStore;
}

function makeApp(opts: MakeAppOpts = {}) {
  const deps: ServerDeps = {
    ingest: async () => ({ ok: true, status: 201, location: "/evidence/s/d" }),
    ingestFile: async () => ({ ok: true, status: 201, idempotent: false }),
    synodIngest: async () => ({ ok: true, status: 201, location: "/evidence/synod/c/0" }),
    synodManifest: async () => ({
      ok: true,
      status: 200,
      body: { party_count: 0, parties: [], verified: null },
    }),
    deliver: async () => ({ ok: true, status: 200, body: { rounds: [] } }),
    deliverFile: async () => ({
      ok: true,
      status: 200,
      body: { out: "b3V0", operator_ephem_pub: "cHVi" },
    }),
    deliveryKeyPut: async () => ({ ok: true, status: 201 }),
    deliveryKeyGet: async () => ({ ok: false, status: 404, error: "none" }),
    manifest: async () => ({ ok: true, status: 200, body: {} }),
    domainPut: async () => ({ ok: true, status: 201 }),
    domainGet: async () => ({ ok: false, status: 404, error: "stub" }),
    health: async () => ({ ok: true }),
    publicKeys: STUB_PUBLIC_KEYS,
    // Same outcome→result mapping wire.ts applies (pipeline ⇒ handler shape).
    traceIngest: async (subaccord, dispute, juror, body) => {
      const out = await ingestTrace(subaccord, dispute, juror, body, {
        store: opts.store ?? store,
        chain: opts.chain ?? chainWith([JUROR_PUB]),
        fanout: (b) => fanned.push(b),
      });
      return out.status === 200 || out.status === 201
        ? { ok: true, status: out.status }
        : { ok: false, status: out.status, error: out.reason };
    },
  };
  return createApp(deps, { traceEnabled: opts.traceEnabled ?? true });
}

function post(body: unknown, juror: string = JUROR): Request {
  return new Request(`http://x/trace/${SUB}/${DISPUTE}/${juror}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

interface BatchFields {
  seq?: number;
  events?: unknown[];
  juror?: string;
}

/** Signed push body: {v, seq, events, sig(base64)} by the given seed. */
function signedBody(f: BatchFields = {}, seed: Uint8Array = JUROR_SEED): Record<string, unknown> {
  const juror = f.juror ?? JUROR;
  const events = f.events ?? [{ type: "duty-open" }];
  const seq = f.seq ?? 1;
  const sig = ed25519.sign(
    buildTraceBatchMessage({ v: 1, juror, dispute: DISPUTE, seq, events }),
    seed,
  );
  return {
    v: 1,
    seq,
    events,
    sig: Buffer.from(sig).toString("base64"),
  };
}

describe("TRACE_ENABLED config", () => {
  it("defaults to false; 'true' opts in", () => {
    expect(loadServerConfig({}).traceEnabled).toBe(false);
    expect(loadServerConfig({ TRACE_ENABLED: "true" }).traceEnabled).toBe(true);
  });
});

describe("POST /trace — disabled", () => {
  it("returns 404 and appends nothing", async () => {
    const app = makeApp({ traceEnabled: false });
    const res = await app.request(post(signedBody()));
    expect(res.status).toBe(404);
    expect(await store.readEvents(DISPUTE)).toEqual([]);
  });
});

describe("POST /trace — guards", () => {
  it("rejects non-address path params with 400", async () => {
    const app = makeApp();
    const bad = "not-an-address";
    expect((await app.request(post(signedBody(), bad))).status).toBe(400);
    expect(
      (
        await app.request(
          new Request(`http://x/trace/${bad}/${DISPUTE}/${JUROR}`, {
            method: "POST",
            body: JSON.stringify(signedBody()),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          new Request(`http://x/trace/${SUB}/${bad}/${JUROR}`, {
            method: "POST",
            body: JSON.stringify(signedBody()),
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("rejects invalid json with 400", async () => {
    const app = makeApp();
    const res = await app.request(post("{not json"));
    expect(res.status).toBe(400);
  });
});

describe("POST /trace — limits", () => {
  it("rejects bodies over 256 KiB with 413", async () => {
    const app = makeApp();
    const events = [{ type: "step", pad: "x".repeat(263_000) }];
    const res = await app.request(post(signedBody({ events })));
    expect(res.status).toBe(413);
    expect(await store.readEvents(DISPUTE)).toEqual([]);
  });

  it("rejects over 64 events with 413; exactly 64 is accepted", async () => {
    const app = makeApp();
    const events = Array.from({ length: 65 }, (_, i) => ({ type: "step", n: i }));
    expect((await app.request(post(signedBody({ events })))).status).toBe(413);
    expect(
      (await app.request(post(signedBody({ events: events.slice(0, 64), seq: 2 })))).status,
    ).toBe(201);
  });
});

describe("POST /trace — envelope shape", () => {
  it("rejects malformed envelopes with 400", async () => {
    const app = makeApp();
    const good = signedBody();
    expect((await app.request(post({ ...good, v: 2 }))).status).toBe(400);
    expect((await app.request(post({ ...good, seq: "1" }))).status).toBe(400);
    expect((await app.request(post({ ...good, seq: 1.5 }))).status).toBe(400);
    expect((await app.request(post({ v: 1, seq: 1, events: [] }))).status).toBe(400); // no sig
    expect((await app.request(post({ ...good, events: "nope" }))).status).toBe(400);
    expect((await app.request(post({ ...good, events: ["nope"] }))).status).toBe(400);
    expect(await store.readEvents(DISPUTE)).toEqual([]);
  });
});

describe("POST /trace — authentication (accord-sith)", () => {
  it("rejects a bad signature with 403 and appends nothing", async () => {
    const app = makeApp();
    const res = await app.request(post(signedBody({}, OUTSIDER_SEED))); // signed by the wrong key
    expect(res.status).toBe(403);
    expect(await store.readEvents(DISPUTE)).toEqual([]);
    expect(fanned).toEqual([]);
  });

  it("rejects a non-drawn juror with 403 (valid sig, not in Round.jurors[])", async () => {
    const app = makeApp();
    const res = await app.request(post(signedBody({ juror: OUTSIDER }, OUTSIDER_SEED)));
    expect(res.status).toBe(403);
    expect(await store.readEvents(DISPUTE)).toEqual([]);
  });

  it("rejects with 403 when no round is drawn yet", async () => {
    const app = makeApp({ chain: chainWith(null) });
    expect((await app.request(post(signedBody()))).status).toBe(403);
  });
});

describe("POST /trace — seq gate", () => {
  it("seq ≤ last is a 200 idempotent no-op (no append, no fan-out)", async () => {
    const app = makeApp();
    expect((await app.request(post(signedBody({ seq: 2 })))).status).toBe(201);
    expect((await app.request(post(signedBody({ seq: 2 })))).status).toBe(200); // same
    expect((await app.request(post(signedBody({ seq: 1 })))).status).toBe(200); // stale
    const es = await store.readEvents(DISPUTE, JUROR);
    expect(es.map((e) => e.seq)).toEqual([2]); // one batch, one event
    expect(fanned).toHaveLength(1);
  });

  it("a seq gap is accepted (monitoring feed, not a ledger)", async () => {
    const app = makeApp();
    expect((await app.request(post(signedBody({ seq: 1 })))).status).toBe(201);
    expect(
      (await app.request(post(signedBody({ seq: 5, events: [{ type: "step", n: 1 }] })))).status,
    ).toBe(201);
    expect((await store.readEvents(DISPUTE, JUROR)).map((e) => e.seq)).toEqual([1, 5]);
  });
});

describe("POST /trace — happy path", () => {
  it("appends an authenticated batch: 201, events durable, fan-out fired", async () => {
    const app = makeApp();
    const events = [{ type: "duty-open" }, { type: "step", n: 1 }];
    const res = await app.request(post(signedBody({ seq: 1, events })));
    expect(res.status).toBe(201);
    const es = await store.readEvents(DISPUTE, JUROR);
    expect(es.map((e) => e.seq)).toEqual([1, 1]);
    expect(es[0]!.event).toEqual({ type: "duty-open" });
    expect(es[1]!.event).toEqual({ type: "step", n: 1 });
    expect(es[0]!.juror).toBe(JUROR);
    expect(fanned).toHaveLength(1);
    expect(fanned[0]!.seq).toBe(1);
  });

  it("store write failure still fans out and returns 201", async () => {
    const failing: TraceStore = {
      async appendBatch() {
        throw new Error("disk full");
      },
      async lastSeq() {
        return null;
      },
      async readEvents() {
        return [];
      },
    };
    const app = makeApp({ store: failing });
    const res = await app.request(post(signedBody()));
    expect(res.status).toBe(201);
    expect(fanned).toHaveLength(1);
  });
});
