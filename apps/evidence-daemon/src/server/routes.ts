/**
 * Evidence HTTP routes (ADR-0011 §HTTP API). Pure wiring: parse path params,
 * guard shape, delegate to injected handlers, map results to HTTP responses.
 * No domain logic lives here.
 *
 *   POST /evidence/:subaccord/:dispute   → ingest handler
 *   GET  /evidence/:dispute/for/:juror   → deliver handler
 */
import { Hono } from "hono";
import type { ServerDeps } from "./handlers.js";

/** Base58 Solana address, 32-44 chars (light guard; chain reader validates). */
// ponytail: charset+length guard only — real validation is the live account read.
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function badAddress(name: string): Response {
  return Response.json({ error: `invalid ${name}` }, { status: 400 });
}

export function evidenceRoutes(deps: ServerDeps): Hono {
  const app = new Hono();

  app.post("/evidence/:subaccord/:dispute", async (c) => {
    const subaccord = c.req.param("subaccord");
    const dispute = c.req.param("dispute");
    if (!ADDRESS.test(subaccord)) return badAddress("subaccord");
    if (!ADDRESS.test(dispute)) return badAddress("dispute");

    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== "object") {
      return Response.json({ error: "invalid json body" }, { status: 400 });
    }

    const res = await deps.ingest(subaccord, dispute, body);
    if (res.ok) {
      return c.body(null, 201, { Location: res.location });
    }
    return Response.json({ error: res.error }, { status: res.status });
  });

  app.get("/evidence/:dispute/for/:juror", async (c) => {
    const dispute = c.req.param("dispute");
    const juror = c.req.param("juror");
    if (!ADDRESS.test(dispute)) return badAddress("dispute");
    if (!ADDRESS.test(juror)) return badAddress("juror");

    const res = await deps.deliver(dispute, juror);
    if (res.ok) {
      return Response.json(res.body, { status: 200 });
    }
    return Response.json({ error: res.error }, { status: res.status });
  });

  return app;
}
