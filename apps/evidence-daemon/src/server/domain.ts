/**
 * Domain CAS routes (ADR-0027 as amended, bean accord-lbst). Pure wiring:
 * validate the hex route param + the ?subaccord anchor param, read the raw
 * body, delegate to injected handlers, map results to HTTP. No domain logic
 * lives here — hash/size/anchor/idempotency checks are
 * {@link ../pipeline/domain.ts}.
 *
 *   PUT /domains/:hash?subaccord=<addr>
 *                        → domain put handler (201 created / 200 no-op);
 *                          the anchor Subaccord must exist on-chain with
 *                          domain_ref == hash (create-first ordering)
 *   GET  /domains/:hash  → domain get handler (bytes + stored Content-Type,
 *                          ETag = hash, Cache-Control: immutable; ungated)
 *
 * Rate limiting is the global per-IP middleware in app.ts (mounted for every
 * route); PUT bodies also pass the global Content-Length cap when configured.
 */
import { Hono } from "hono";
import { DEFAULT_DOMAIN_CONTENT_TYPE } from "../store/domain.js";
import { ADDRESS } from "./routes.js";
import type { ServerDeps } from "./handlers.js";

/** sha256 digest shape: exactly 64 lowercase hex chars, else 400. */
const HASH = /^[0-9a-f]{64}$/;

function badHash(): Response {
  return Response.json({ error: "hash must be 64-char lowercase hex" }, { status: 400 });
}

function badSubaccord(detail: string): Response {
  return Response.json({ error: `invalid subaccord: ${detail}` }, { status: 400 });
}

export function domainRoutes(deps: ServerDeps): Hono {
  const app = new Hono();

  app.put("/domains/:hash", async (c) => {
    const hash = c.req.param("hash");
    if (!HASH.test(hash)) return badHash();
    const subaccord = c.req.query("subaccord");
    if (subaccord === undefined) return badSubaccord("?subaccord=<addr> query parameter required");
    if (!ADDRESS.test(subaccord)) return badSubaccord("must be a base58 address");
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    // Passthrough: store the header verbatim, defaulting when absent. The
    // route and store stay format-blind — no sniffing, no parse.
    const contentType = c.req.header("content-type") ?? DEFAULT_DOMAIN_CONTENT_TYPE;
    const res = await deps.domainPut(hash, bytes, contentType, subaccord);
    if (!res.ok) {
      return Response.json({ error: res.error }, { status: res.status });
    }
    // 201 carries the canonical URL; the idempotent 200 no-op does not.
    if (res.status === 201) {
      return c.body(null, 201, { Location: `/domains/${hash}` });
    }
    return c.body(null, 200);
  });

  app.get("/domains/:hash", async (c) => {
    const hash = c.req.param("hash");
    if (!HASH.test(hash)) return badHash();
    const res = await deps.domainGet(hash);
    if (res.ok) {
      return new Response(res.bytes, {
        status: 200,
        headers: {
          "Content-Type": res.contentType,
          ETag: hash,
          "Cache-Control": "immutable",
        },
      });
    }
    return Response.json({ error: res.error }, { status: res.status });
  });

  return app;
}
