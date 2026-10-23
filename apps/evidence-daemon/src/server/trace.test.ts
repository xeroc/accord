/**
 * Trace replay route contract (bean accord-f6hh, ADR-0037).
 *
 * GET /trace/{dispute}?fromSeq= replays the durable trace record, seal-on-read:
 * verdict frames stay withheld while now < unsealAt (the pipeline/seal.ts
 * predicate — no path bypasses it). Reads the TraceStore seam, so it works on
 * any replica (no in-memory state).
 */
import { describe, expect, it } from "bun:test";
import { createApp } from "./app.js";
import type { ServerDeps, TraceEnvelope, TraceReplayHandler } from "./handlers.js";
import { createTraceReplayHandler, type TraceReplaySource } from "./trace.js";
import type { KeyringPublicKeys } from "./public-keys.js";

// 32x '1' — valid base58 charset + length, opaque to the server.
const DISPUTE = "1111111111111111111111111111111D";
const JUROR = "1111111111111111111111111111111J";

const STUB_PUBLIC_KEYS: KeyringPublicKeys = { operators: [] };

function makeDeps(traceReplay?: TraceReplayHandler): ServerDeps {
  return {
    ingest: async () => ({ ok: true, status: 201, location: `/evidence/s/d` }),
    ingestFile: async () => ({ ok: true, status: 201, idempotent: false }),
    synodIngest: async () => ({ ok: true, status: 201, location: "/evidence/synod/c/0" }),
    synodManifest: async () => ({ ok: true, status: 200, body: {} }),
    deliver: async () => ({
      ok: true,
      status: 200,
      body: { rounds: [{ round: 0, out: "b3V0", operator_ephem_pub: "cHVi" }] },
    }),
    deliverFile: async () => ({
      ok: true,
      status: 200,
      body: { out: "b3V0", operator_ephem_pub: "cHVi" },
    }),
    deliveryKeyPut: async () => ({ ok: true, status: 201 }),
    deliveryKeyGet: async () => ({ ok: false, status: 404, error: "stub" }),
    domainPut: async () => ({ ok: true, status: 201 }),
    domainGet: async () => ({ ok: false, status: 404, error: "stub" }),
    manifest: async () => ({ ok: true, status: 200, body: {} }),
    health: async () => ({ ok: true }),
    publicKeys: STUB_PUBLIC_KEYS,
    ...(traceReplay === undefined ? {} : { traceReplay }),
  };
}

function envelope(seq: number, event: Record<string, unknown>): TraceEnvelope {
  return { v: 1, at: 1_700_000_000_000 + seq, seq, juror: JUROR, dispute: DISPUTE, event };
}

/** In-memory seam standing in for the TraceStore read side. */
function fakeSource(
  envelopes: TraceEnvelope[],
): TraceReplaySource & { calls: Array<[string, number | undefined]> } {
  const calls: Array<[string, number | undefined]> = [];
  return {
    calls,
    readEvents: (dispute: string, _juror?: string, fromSeq?: number) => {
      calls.push([dispute, fromSeq]);
      return Promise.resolve(envelopes);
    },
  };
}

function app(source?: TraceReplaySource) {
  return createApp(makeDeps(source === undefined ? undefined : createTraceReplayHandler(source)));
}

describe("GET /trace/:dispute (seal-on-read replay)", () => {
  it("withholds sealed verdict frames, keeps visible order", async () => {
    const now = Date.now();
    const source = fakeSource([
      envelope(1, { type: "agent-start", model: "m" }),
      envelope(2, { type: "verdict", optionIndex: 0, unsealAt: now + 600_000 }),
      envelope(3, { type: "commit", dryRun: true }),
      envelope(4, { type: "verdict", optionIndex: 1, unsealAt: now - 1 }),
    ]);

    const res = await app(source).request(`/trace/${DISPUTE}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as TraceEnvelope[];
    expect(body.map((e) => e.seq)).toEqual([1, 3, 4]);
  });

  it("forwards fromSeq to the store seam", async () => {
    const source = fakeSource([envelope(8, { type: "reveal", tx: "sig" })]);

    const res = await app(source).request(`/trace/${DISPUTE}?fromSeq=7`);
    expect(res.status).toBe(200);
    expect(source.calls).toEqual([[DISPUTE, 7]]);
    const body = (await res.json()) as TraceEnvelope[];
    expect(body.map((e) => e.seq)).toEqual([8]);
  });

  it("rejects non-numeric / negative fromSeq with 400, no store read", async () => {
    const source = fakeSource([]);
    const a = app(source);
    for (const bad of ["abc", "-1", "1.5"]) {
      const res = await a.request(`/trace/${DISPUTE}?fromSeq=${bad}`);
      expect(res.status).toBe(400);
    }
    expect(source.calls).toHaveLength(0);
  });

  it("404s when the replay seam is not wired (feature off)", async () => {
    const res = await app().request(`/trace/${DISPUTE}`);
    expect(res.status).toBe(404);
  });

  it("400s on a malformed dispute address", async () => {
    const res = await app(fakeSource([])).request("/trace/not-an-address");
    expect(res.status).toBe(400);
  });

  it("500s when the store read fails", async () => {
    const failing: TraceReplaySource = {
      readEvents: () => Promise.reject(new Error("s3 down")),
    };
    const res = await app(failing).request(`/trace/${DISPUTE}`);
    expect(res.status).toBe(500);
  });

  it("200 + empty array for an empty record", async () => {
    const res = await app(fakeSource([])).request(`/trace/${DISPUTE}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
