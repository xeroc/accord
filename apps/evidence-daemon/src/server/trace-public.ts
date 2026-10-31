/**
 * Trace publication endpoint (ADR-0037 read gate, inveigo ADR-0013 amendment).
 *
 *   POST /trace-public/{subaccord}/{dispute}/{juror}   body {v: 1, sig} → 204
 *
 * The daemon NEVER derives publication from verdict frames — jurat notifies
 * it exactly when its committed vote is the FLIP side (`Final+1 = FLIP` per
 * inveigo settle.rs / packages/sdk crank.ts; `Final+0 = HOLD` stays private).
 * Non-inveigo courts: jurat never calls ⇒ the record stays filer-private
 * forever (publication is opt-in). On valid auth the durable public stamp is
 * set (TraceStore.markPublic — idempotent), which opens GET /trace and WS
 * /watch tokenless.
 *
 * Auth mirrors TRACE INGEST (pipeline/trace.ts) exactly, so jurat reuses one
 * signing scheme: `sig` = base64(Ed25519(juror hot key) over the canonical
 * EMPTY batch {v:1, juror, dispute, seq:0, events:[]}) — verified via the
 * shared @useaccord/sdk/evidence helper — then the live `Round.jurors[]`
 * drawn-set gate (same as ingest; no round yet ⇒ 403). Status map: 400 bad
 * address/body, 401 bad sig, 403 not drawn, 204 stamped.
 */
import { Hono } from "hono";
import bs58 from "bs58";
import { address } from "@solana/kit";
import { verifyTraceBatchSig } from "@useaccord/sdk/evidence";

import type { TraceStore } from "../store/trace.js";
import { base64ToBytes } from "../store/store.js";
import type { TraceChainReader } from "../pipeline/trace.js";
import { ADDRESS } from "./routes.js";
import type { ServerDeps } from "./handlers.js";

export interface TracePublishDeps {
  readonly store: TraceStore;
  readonly chain: TraceChainReader;
}

/** Pipeline outcome → handler mapping happens in wire.ts. */
export type TracePublishOutcome =
  { readonly status: 204 } | { readonly status: 400 | 401 | 403; readonly reason: string };

/** Constant-shape byte compare (same private helper as pipeline/trace.ts). */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/**
 * Authenticate one publication push and stamp the dispute public. Same gate
 * order as ingest: envelope shape → sig over the canonical empty batch →
 * live round membership → durable idempotent stamp.
 */
export async function publishTrace(
  subaccord: string,
  dispute: string,
  juror: string,
  body: unknown,
  deps: TracePublishDeps,
): Promise<TracePublishOutcome> {
  if (typeof body !== "object" || body === null) {
    return { status: 400, reason: "invalid body" };
  }
  const r = body as Record<string, unknown>;
  if (r.v !== 1) return { status: 400, reason: "unsupported envelope version" };
  if (typeof r.sig !== "string" || r.sig.length === 0) {
    return { status: 400, reason: "missing sig" };
  }

  let jurorPub: Uint8Array;
  let disputeBytes: Uint8Array;
  let sig: Uint8Array;
  try {
    jurorPub = bs58.decode(juror);
    disputeBytes = bs58.decode(dispute);
    sig = base64ToBytes(r.sig);
  } catch {
    return { status: 401, reason: "malformed signature or address encoding" };
  }
  // The signed message is the canonical EMPTY batch — one signing scheme
  // shared with batch ingest (jurat reuses signTraceBatch).
  const message = { v: 1 as const, juror, dispute, seq: 0, events: [] as unknown[] };
  if (!verifyTraceBatchSig(jurorPub, message, sig)) {
    return { status: 401, reason: "signature does not verify for juror" };
  }

  // Round gate: mirrors ingest — the juror must be drawn in the CURRENT round.
  const round = await deps.chain.readRound(disputeBytes);
  if (round === null || !round.jurors.some((j) => bytesEqual(j, jurorPub))) {
    return { status: 403, reason: "juror not drawn for this dispute" };
  }

  await deps.store.markPublic(address(dispute));
  return { status: 204 };
}

/** Pure wiring: path guards, JSON parse, delegate, map to HTTP. */
export function tracePublicRoutes(deps: Pick<ServerDeps, "tracePublish">): Hono {
  const app = new Hono();
  app.post("/trace-public/:subaccord/:dispute/:juror", async (c) => {
    if (deps.tracePublish === undefined) {
      return Response.json({ error: "trace publication not enabled" }, { status: 404 });
    }
    const subaccord = c.req.param("subaccord");
    const dispute = c.req.param("dispute");
    const juror = c.req.param("juror");
    if (!ADDRESS.test(subaccord))
      return Response.json({ error: "invalid subaccord" }, { status: 400 });
    if (!ADDRESS.test(dispute)) return Response.json({ error: "invalid dispute" }, { status: 400 });
    if (!ADDRESS.test(juror)) return Response.json({ error: "invalid juror" }, { status: 400 });
    const body: unknown = await c.req.json().catch(() => null);
    const res = await deps.tracePublish(subaccord, dispute, juror, body);
    if (res.ok) return c.body(null, res.status);
    return Response.json({ error: res.error }, { status: res.status });
  });
  return app;
}
