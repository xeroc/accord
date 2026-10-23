// trace.test.ts — POST /trace/{subaccord}/{dispute}/{juror} contract suite
// (bean accord-lmcc, ADR-0037).
//
// Drives createApp over the REAL trace pipeline (pipeline/trace.ts) wired to a
// real FsTraceStore in a temp dir: disabled 404 (TRACE_ENABLED default false),
// address guards 400, body-cap 413 (256 KiB), envelope shape 400 / events-cap
// 413 (64), happy 201 + durable append, idempotent re-append of a stored seq.
// Evidence handlers are stubs — this suite owns the trace namespace only.
//
// Run: `pnpm --filter @useaccord/evidence-daemon test` (→ bun test).

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { address, type Address } from "@solana/kit";

import { loadServerConfig } from "../config.js";
import { FsTraceStore } from "../store/trace-fs.js";
import { ingestTrace } from "../pipeline/trace.js";
import { createApp } from "./app.js";
import type { ServerDeps } from "./handlers.js";
import type { KeyringPublicKeys } from "./public-keys.js";

const SUB: Address = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const DISPUTE: Address = address("11111111111111111111111111111111");
const JUROR: Address = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const STUB_PUBLIC_KEYS: KeyringPublicKeys = {
  operators: [{ base58: "1".repeat(32), hex: "ff".repeat(32) }],
};

let rootDir: string;
let store: FsTraceStore;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "trace-routes-"));
  store = new FsTraceStore({ rootDir });
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

function makeApp(traceEnabled: boolean) {
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
    health: async () => ({ ok: true }),
    publicKeys: STUB_PUBLIC_KEYS,
    // Same outcome→result mapping wire.ts applies (pipeline ⇒ handler shape).
    domainPut: async () => ({ ok: true, status: 201 }),
    domainGet: async () => ({ ok: false, status: 404, error: "stub" }),
    traceIngest: async (subaccord, dispute, juror, body) => {
      const out = await ingestTrace(subaccord, dispute, juror, body, { store });
      return out.status === 201
        ? { ok: true, status: 201 }
        : { ok: false, status: out.status, error: out.reason };
    },
  };
  return createApp(deps, { traceEnabled });
}

function post(body: unknown, juror: string = JUROR): Request {
  return new Request(`http://x/trace/${SUB}/${DISPUTE}/${juror}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function batchBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { v: 1, seq: 1, sig: "x".repeat(64), events: [{ type: "duty-open" }], ...overrides };
}

describe("TRACE_ENABLED config", () => {
  it("defaults to false; 'true' opts in", () => {
    expect(loadServerConfig({}).traceEnabled).toBe(false);
    expect(loadServerConfig({ TRACE_ENABLED: "true" }).traceEnabled).toBe(true);
  });
});

describe("POST /trace — disabled", () => {
  it("returns 404 and appends nothing", async () => {
    const app = makeApp(false);
    const res = await app.request(post(batchBody()));
    expect(res.status).toBe(404);
    expect(await store.readEvents(DISPUTE)).toEqual([]);
  });
});

describe("POST /trace — guards", () => {
  it("rejects non-address path params with 400", async () => {
    const app = makeApp(true);
    const bad = "not-an-address";
    expect((await app.request(post(batchBody(), bad))).status).toBe(400);
    expect(
      (
        await app.request(
          new Request(`http://x/trace/${bad}/${DISPUTE}/${JUROR}`, {
            method: "POST",
            body: JSON.stringify(batchBody()),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          new Request(`http://x/trace/${SUB}/${bad}/${JUROR}`, {
            method: "POST",
            body: JSON.stringify(batchBody()),
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("rejects invalid json with 400", async () => {
    const app = makeApp(true);
    const res = await app.request(post("{not json"));
    expect(res.status).toBe(400);
  });
});

describe("POST /trace — limits", () => {
  it("rejects bodies over 256 KiB with 413", async () => {
    const app = makeApp(true);
    const body = batchBody({ events: [{ type: "step", pad: "x".repeat(263_000) }] });
    const res = await app.request(post(body));
    expect(res.status).toBe(413);
    expect(await store.readEvents(DISPUTE)).toEqual([]);
  });

  it("rejects over 64 events with 413; exactly 64 is accepted", async () => {
    const app = makeApp(true);
    const events = Array.from({ length: 65 }, (_, i) => ({ type: "step", n: i }));
    expect((await app.request(post(batchBody({ events })))).status).toBe(413);
    expect(
      (await app.request(post(batchBody({ events: events.slice(0, 64), seq: 2 })))).status,
    ).toBe(201);
  });
});

describe("POST /trace — envelope shape", () => {
  it("rejects malformed envelopes with 400", async () => {
    const app = makeApp(true);
    expect((await app.request(post(batchBody({ v: 2 })))).status).toBe(400);
    expect((await app.request(post(batchBody({ seq: "1" })))).status).toBe(400);
    expect((await app.request(post(batchBody({ seq: 1.5 })))).status).toBe(400);
    expect((await app.request(post({ v: 1, seq: 1, events: [] }))).status).toBe(400); // no sig
    expect((await app.request(post(batchBody({ events: "nope" })))).status).toBe(400);
    expect((await app.request(post(batchBody({ events: ["nope"] })))).status).toBe(400);
    expect(await store.readEvents(DISPUTE)).toEqual([]);
  });
});

describe("POST /trace — happy path", () => {
  it("appends a verified-shape batch: 201, events durable", async () => {
    const app = makeApp(true);
    const res = await app.request(
      post(batchBody({ events: [{ type: "duty-open" }, { type: "step", n: 1 }] })),
    );
    expect(res.status).toBe(201);
    const es = await store.readEvents(DISPUTE, JUROR);
    expect(es.map((e) => e.seq)).toEqual([1, 1]);
    expect(es[0]!.event).toEqual({ type: "duty-open" });
    expect(es[1]!.event).toEqual({ type: "step", n: 1 });
    expect(es[0]!.juror).toBe(JUROR);
  });

  it("re-append of a stored seq stays a single batch", async () => {
    const app = makeApp(true);
    expect((await app.request(post(batchBody()))).status).toBe(201);
    expect((await app.request(post(batchBody()))).status).toBe(201);
    const es = await store.readEvents(DISPUTE, JUROR);
    expect(es).toHaveLength(1);
  });
});
