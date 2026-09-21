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
 *   PUT /domains/:hash?subaccord=<addr>&preimage=<hex>&offset=<n>
 *                        → same, but for DERIVED domain_refs (hash ≠
 *                          sha256(body)): the preimage must hash to the
 *                          on-chain domain_ref and contain sha256(body) at
 *                          byte offset n (pipeline/domain.ts proof mode)
 *   GET  /domains/:hash  → domain get handler (bytes + stored Content-Type,
 *                          ETag = hash, Cache-Control: immutable; ungated)
 *
 * Rate limiting is the global per-IP middleware in app.ts (mounted for every
 * route); PUT bodies also pass the global Content-Length cap when configured.
 */
import { Hono } from "hono";
import { DEFAULT_DOMAIN_CONTENT_TYPE } from "../store/domain.js";
import type { DomainPreimageProof } from "../pipeline/domain.js";
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

/** Non-empty lowercase hex, even length (whole bytes only). */
const PREIMAGE_HEX = /^[0-9a-f]+$/;

/**
 * Both-or-neither preimage proof params → decoded proof, or an error
 * response. Absent params ⇒ `{}` (identity mode — today's CAS contract).
 */
function parseProof(
  preimageHex: string | undefined,
  offsetStr: string | undefined,
): { proof?: DomainPreimageProof; error?: Response } {
  if (preimageHex === undefined && offsetStr === undefined) return {};
  if (preimageHex === undefined || offsetStr === undefined) {
    return {
      error: Response.json(
        { error: "preimage and offset must be supplied together" },
        { status: 400 },
      ),
    };
  }
  if (preimageHex.length === 0 || preimageHex.length % 2 !== 0 || !PREIMAGE_HEX.test(preimageHex)) {
    return {
      error: Response.json(
        { error: "preimage must be non-empty even-length lowercase hex" },
        { status: 400 },
      ),
    };
  }
  const offset = Number(offsetStr);
  if (!Number.isInteger(offset) || offset < 0) {
    return {
      error: Response.json({ error: "offset must be a non-negative integer" }, { status: 400 }),
    };
  }
  const pairs = preimageHex.match(/../g) ?? [];
  return { proof: { preimage: Uint8Array.from(pairs, (h) => parseInt(h, 16)), offset } };
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
    const { proof, error } = parseProof(c.req.query("preimage"), c.req.query("offset"));
    if (error !== undefined) return error;
    const res = await deps.domainPut(hash, bytes, contentType, subaccord, proof);
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
