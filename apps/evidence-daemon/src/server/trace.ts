/**
 * Trace replay route + handler (ADR-0037, bean accord-f6hh).
 *
 *   GET /trace/{dispute}?fromSeq=<n> → 200 seal-filtered envelopes
 *
 * Reads the durable trace record (append-only, written at ingest) — pure
 * store + seal predicate, no in-memory state, so it answers correctly on any
 * replica. Seal-on-read: verdict frames carrying `unsealAt` stay withheld
 * until `now >= unsealAt` (the shared `pipeline/seal.ts` predicate — no read
 * path bypasses it). When the replay seam is not wired the route 404s (the
 * trace feature is off).
 */
import { Hono } from "hono";
import type { ServerDeps, TraceEnvelope, TraceReplayHandler } from "./handlers.js";
import { ADDRESS } from "./routes.js";
import { sealVisible } from "../pipeline/seal.js";

/**
 * Read side of the trace store seam (structural slice of the TraceStore port,
 * ADR-0037): ordered by (juror, seq). Satisfied by the fs/s3 TraceStore impls.
 */
export interface TraceReplaySource {
  readEvents(dispute: string, juror?: string, fromSeq?: number): Promise<readonly TraceEnvelope[]>;
}

/**
 * Concrete replay handler: read the store, drop frames still sealed at read
 * time, return the rest verbatim in store order. Store failures map to 500 —
 * a replay outage must not corrupt or partial-serve the record.
 */
export function createTraceReplayHandler(source: TraceReplaySource): TraceReplayHandler {
  return async (dispute, fromSeq) => {
    let envelopes: readonly TraceEnvelope[];
    try {
      envelopes = await source.readEvents(dispute, undefined, fromSeq);
    } catch (e) {
      return {
        ok: false,
        status: 500,
        error: `trace read failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    const now = Date.now();
    return { ok: true, status: 200, body: envelopes.filter((e) => sealVisible(e.event, now)) };
  };
}

/** Non-negative integer (per-juror seq cursor). */
const SEQ = /^(0|[1-9][0-9]*)$/;

/** Pure wiring: path/query guards, delegate, map result to HTTP. */
export function traceRoutes(deps: ServerDeps): Hono {
  const app = new Hono();

  app.get("/trace/:dispute", async (c) => {
    const dispute = c.req.param("dispute");
    if (!ADDRESS.test(dispute)) {
      return Response.json({ error: "invalid dispute" }, { status: 400 });
    }
    const fromSeqStr = c.req.query("fromSeq");
    let fromSeq: number | undefined;
    if (fromSeqStr !== undefined) {
      if (!SEQ.test(fromSeqStr)) {
        return Response.json({ error: "invalid fromSeq" }, { status: 400 });
      }
      fromSeq = Number(fromSeqStr);
    }
    if (deps.traceReplay === undefined) {
      return Response.json({ error: "trace replay not enabled" }, { status: 404 });
    }
    const res = await deps.traceReplay(dispute, fromSeq);
    if (res.ok) return Response.json(res.body, { status: 200 });
    return Response.json({ error: res.error }, { status: res.status });
  });

  return app;
}
