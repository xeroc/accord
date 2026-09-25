/**
 * Evidence HTTP routes (ADR-0011 §HTTP API). Pure wiring: parse path params,
 * guard shape, delegate to injected handlers, map results to HTTP responses.
 * No domain logic lives here.
 *   POST /evidence/synod/:case/:party          → synod ingest handler (pre-dispute grouping, accord-1viq)
 *   GET  /evidence/synod/:case                 → synod manifest handler (assembled group, accord-lry5)
 *   POST /evidence/:subaccord/:dispute[/:round]   → ingest handler (round default 0)
 *   GET  /evidence/:dispute/for/:juror            → deliver handler
 *   GET  /evidence/:subaccord/:dispute[/:round]   → manifest handler (public, round default 0)
 *   PUT  /jurors/:juror/delivery-key              → Delivery Key registration (ADR-0034)
 *   GET  /jurors/:juror/delivery-key              → registered Delivery Key (ADR-0034)
 */
import { Hono } from "hono";
import type { ServerDeps } from "./handlers.js";

/** Base58 Solana address, 32-44 chars (light guard; chain reader validates). */
// ponytail: charset+length guard only — real validation is the live account read.
export const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Non-negative integer (evidence round index, ADR-0023). */
const ROUND = /^(0|[1-9][0-9]*)$/;
/** Party slot 0–6 (Synod MAX_PARTIES − 1; roster floor is 2). */
const SLOT = /^[0-6]$/;

function badAddress(name: string): Response {
  return Response.json({ error: `invalid ${name}` }, { status: 400 });
}

export function evidenceRoutes(deps: ServerDeps): Hono {
  const app = new Hono();

  // Synod pre-dispute grouping (accord-1viq): pushed per party BEFORE any
  // dispute exists; grouped by case PDA + slot. Registered BEFORE the generic
  // dispute-keyed routes so the literal "synod" segment is not captured as
  // :subaccord (it would fail the ADDRESS guard, but explicit-first wins).
  app.post("/evidence/synod/:case/:party", async (c) => {
    const casePda = c.req.param("case");
    const party = c.req.param("party");
    if (!ADDRESS.test(casePda)) return badAddress("case");
    if (!SLOT.test(party)) {
      return Response.json({ error: "invalid party slot" }, { status: 400 });
    }

    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== "object") {
      return Response.json({ error: "invalid json body" }, { status: 400 });
    }

    const res = await deps.synodIngest(casePda, Number(party), body);
    if (res.ok) {
      return c.body(null, 201, { Location: res.location });
    }
    return Response.json({ error: res.error }, { status: res.status });
  });

  // Assembled multi-bundle manifest (accord-lry5). Registered BEFORE the
  // generic GET /evidence/:subaccord/:dispute so "synod" is not captured as
  // a subaccord address.
  app.get("/evidence/synod/:case", async (c) => {
    const casePda = c.req.param("case");
    if (!ADDRESS.test(casePda)) return badAddress("case");
    const res = await deps.synodManifest(casePda);
    if (res.ok) {
      return Response.json(res.body, { status: res.status });
    }
    return Response.json({ error: res.error }, { status: res.status });
  });
  // Round is optional and defaults to 0 (filer evidence). Two routes keep the
  // guard explicit and the param always defined when the handler runs.
  app.post("/evidence/:subaccord/:dispute/:round", async (c) => {
    const subaccord = c.req.param("subaccord");
    const dispute = c.req.param("dispute");
    const roundStr = c.req.param("round");
    if (!ADDRESS.test(subaccord)) return badAddress("subaccord");
    if (!ADDRESS.test(dispute)) return badAddress("dispute");
    if (!ROUND.test(roundStr)) {
      return Response.json({ error: "invalid round" }, { status: 400 });
    }

    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== "object") {
      return Response.json({ error: "invalid json body" }, { status: 400 });
    }

    const res = await deps.ingest(subaccord, dispute, Number(roundStr), body);
    if (res.ok) {
      return c.body(null, 201, { Location: res.location });
    }
    return Response.json({ error: res.error }, { status: res.status });
  });

  app.post("/evidence/:subaccord/:dispute", async (c) => {
    const subaccord = c.req.param("subaccord");
    const dispute = c.req.param("dispute");
    if (!ADDRESS.test(subaccord)) return badAddress("subaccord");
    if (!ADDRESS.test(dispute)) return badAddress("dispute");

    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== "object") {
      return Response.json({ error: "invalid json body" }, { status: 400 });
    }

    const res = await deps.ingest(subaccord, dispute, 0, body);
    if (res.ok) {
      return c.body(null, 201, { Location: res.location });
    }
    return Response.json({ error: res.error }, { status: res.status });
  });

  // v2 multifile (accord-5d0r): one document per PUT, path = manifest entry
  // (relative POSIX; the splat captures nested paths like docs/x.pdf).
  app.put("/evidence/:subaccord/:dispute/:round/*", async (c) => {
    const subaccord = c.req.param("subaccord");
    const dispute = c.req.param("dispute");
    const roundStr = c.req.param("round");
    if (!ADDRESS.test(subaccord)) return badAddress("subaccord");
    if (!ADDRESS.test(dispute)) return badAddress("dispute");
    if (!ROUND.test(roundStr)) {
      return Response.json({ error: "invalid round" }, { status: 400 });
    }
    // Hono 4 splat: no named param — slice the decoded remainder.
    const prefix = `/evidence/${subaccord}/${dispute}/${roundStr}/`;
    const path = c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) : "";
    if (path === "" || path.includes("\\")) {
      return Response.json({ error: "invalid entry path" }, { status: 400 });
    }

    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== "object") {
      return Response.json({ error: "invalid json body" }, { status: 400 });
    }

    const res = await deps.ingestFile(subaccord, dispute, Number(roundStr), path, body);
    if (res.ok) {
      return c.body(null, 201);
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

  // v2 per-file delivery (accord-5d0r): one document per GET, juror-bound.
  app.get("/evidence/:dispute/for/:juror/:round/*", async (c) => {
    const dispute = c.req.param("dispute");
    const juror = c.req.param("juror");
    const roundStr = c.req.param("round");
    if (!ADDRESS.test(dispute)) return badAddress("dispute");
    if (!ADDRESS.test(juror)) return badAddress("juror");
    if (!ROUND.test(roundStr)) {
      return Response.json({ error: "invalid round" }, { status: 400 });
    }
    const prefix = `/evidence/${dispute}/for/${juror}/${roundStr}/`;
    const path = c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) : "";
    if (path === "") {
      return Response.json({ error: "missing entry path" }, { status: 400 });
    }

    const res = await deps.deliverFile(dispute, juror, Number(roundStr), path);
    if (res.ok) {
      return Response.json(res.body, { status: 200 });
    }
    return Response.json({ error: res.error }, { status: res.status });
  });

  // Manifest — GET the raw stored ciphertext bundle (no auth, no re-encryption).
  // Registered after the deliver route so /evidence/:dispute/for/:juror (literal
  // "for") takes priority over /evidence/:subaccord/:dispute/:round.
  app.get("/evidence/:subaccord/:dispute/:round", async (c) => {
    const subaccord = c.req.param("subaccord");
    const dispute = c.req.param("dispute");
    const roundStr = c.req.param("round");
    if (!ADDRESS.test(subaccord)) return badAddress("subaccord");
    if (!ADDRESS.test(dispute)) return badAddress("dispute");
    if (!ROUND.test(roundStr)) {
      return Response.json({ error: "invalid round" }, { status: 400 });
    }
    const res = await deps.manifest(subaccord, dispute, Number(roundStr));
    if (res.ok) return Response.json(res.body, { status: 200 });
    return Response.json({ error: res.error }, { status: res.status });
  });

  app.get("/evidence/:subaccord/:dispute", async (c) => {
    const subaccord = c.req.param("subaccord");
    const dispute = c.req.param("dispute");
    if (!ADDRESS.test(subaccord)) return badAddress("subaccord");
    if (!ADDRESS.test(dispute)) return badAddress("dispute");
    const res = await deps.manifest(subaccord, dispute, 0);
    if (res.ok) return Response.json(res.body, { status: 200 });
    return Response.json({ error: res.error }, { status: res.status });
  });

  // Delivery Key registration (ADR-0034): register/rotate + read-back. Open
  // registration — the wallet signature IS the binding; delivery gates on
  // Round.jurors[] separately.
  app.put("/jurors/:juror/delivery-key", async (c) => {
    const juror = c.req.param("juror");
    if (!ADDRESS.test(juror)) return badAddress("juror");
    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== "object") {
      return Response.json({ error: "invalid json body" }, { status: 400 });
    }
    const res = await deps.deliveryKeyPut(juror, body);
    if (res.ok) return c.body(null, 201);
    return Response.json({ error: res.error }, { status: res.status });
  });

  app.get("/jurors/:juror/delivery-key", async (c) => {
    const juror = c.req.param("juror");
    if (!ADDRESS.test(juror)) return badAddress("juror");
    const res = await deps.deliveryKeyGet(juror);
    if (res.ok) return Response.json(res.body, { status: 200 });
    return Response.json({ error: res.error }, { status: res.status });
  });

  return app;
}
