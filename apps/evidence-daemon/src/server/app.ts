/**
 * Hono app assembly: per-IP rate limit, accounting-only X-Account-Key, mounted
 * evidence + /healthz routes. Stateless — safe behind N replicas with no
 * session affinity (ADR-0011 §HA).
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ServerDeps } from "./handlers.js";
import { evidenceRoutes } from "./routes.js";
import { domainRoutes } from "./domain.js";

export interface AppOptions {
  /** Per-peer-IP requests/min. 0 disables the limiter. Default: 0. */
  readonly rateLimitPerMin?: number;
  /** Body size cap in bytes applied before route handlers. 0 = no cap. */
  readonly maxBytes?: number;
  /**
   * If true, a missing X-Account-Key is logged but never denies (accounting
   * only — confidentiality rests on Juror-bound re-encryption, ADR-0006).
   */
  readonly accountKeyEnabled?: boolean;
  /**
   * If true, peer IP is taken from X-Forwarded-For (only safe behind a trusted
   * LB/Ingress that overwrites XFF). Default false → XFF is ignored and the
   * peer is unknown at this layer, so a direct client can't spoof the header
   * to evade the per-IP rate limit.
   */
  readonly trustProxy?: boolean;
  readonly log?: (msg: string, fields?: Record<string, unknown>) => void;
  /**
   * Value for the Access-Control-Allow-Origin response header. Defaults to
   * `"*"` (allow any origin). Set to a specific origin to restrict.
   */
  readonly corsOrigin?: string;
}

interface RateBucket {
  count: number;
  windowStart: number;
}

const MIN_MS = 60_000;
/** Methods that may carry a request body (subject to the size cap). */
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

/**
 * Resolve the peer IP. Honors X-Forwarded-For only when {@link trustProxy} is
 * set — secure by default. ponytail: leftmost XFF entry (correct for a trusted
 * LB that overwrites the header); a hop-count selector is the upgrade path if a
 * multi-hop trust chain ever needs it.
 */
function peerIp(req: Request, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  }
  return "unknown";
}

export function createApp(deps: ServerDeps, opts: AppOptions = {}): Hono {
  const app = new Hono();
  const log = opts.log ?? (() => {});
  const perMin = opts.rateLimitPerMin ?? 0;
  const maxBytes = opts.maxBytes ?? 0;
  const accountKeyEnabled = opts.accountKeyEnabled ?? false;
  const trustProxy = opts.trustProxy ?? false;
  const corsOrigin = opts.corsOrigin ?? "*";

  // CORS — applied first so OPTIONS preflight is handled (204 + headers) before
  // the rate limiter or body cap can reject the request.
  app.use("*", cors({ origin: corsOrigin }));

  // ponytail: in-process fixed-window counter — per-replica, not shared.
  // Adequate for basic DoS; a shared limiter (Redis) is a v1+ ops upgrade and
  // does not change the handler contract.
  const buckets = new Map<string, RateBucket>();

  app.use("*", async (c, next) => {
    // Accounting-only key: observe, never enforce (ADR-0006/0011).
    if (accountKeyEnabled) {
      const key = c.req.header("x-account-key");
      if (key) log("account-key", { key, ip: peerIp(c.req.raw, trustProxy) });
    }

    if (maxBytes > 0 && BODY_METHODS.has(c.req.method.toUpperCase())) {
      const cl = c.req.raw.headers.get("content-length");
      // ponytail: require a bounded Content-Length so a chunked/streamed body
      // can't bypass the pre-handler cap. Residual: a client can still lie on
      // CL — upgrade to a stream-counting read (abort at maxBytes) if that
      // threat matters; default maxEvidenceBytes=0 keeps this dormant.
      if (cl === null) {
        return Response.json({ error: "content-length required" }, { status: 411 });
      }
      if (Number(cl) > maxBytes) {
        return Response.json({ error: "request too large" }, { status: 413 });
      }
    }

    if (perMin > 0) {
      const ip = peerIp(c.req.raw, trustProxy);
      const now = Date.now();
      const b = buckets.get(ip);
      if (b === undefined || now - b.windowStart >= MIN_MS) {
        buckets.set(ip, { count: 1, windowStart: now });
      } else if (b.count >= perMin) {
        return Response.json(
          { error: "rate limit exceeded" },
          { status: 429, headers: { "Retry-After": "60" } },
        );
      } else {
        b.count += 1;
      }
    }

    await next();
  });

  app.route("/", evidenceRoutes(deps));
  app.route("/", domainRoutes(deps));

  // /healthz — bean accord-u1pu implements the real S3+RPC probe; the server
  // boots with this stub so main() serves immediately.
  app.get("/healthz", async () => {
    const res = await deps.health();
    return res.ok
      ? Response.json({ status: "ok" }, { status: 200 })
      : Response.json({ status: "degraded", detail: res.detail }, { status: 503 });
  });

  // GET /config — the operator Ed25519 public keys loaded into the keyring
  // (ADR-0011). Pubkeys are public (== on-chain `evidence_operator`); the only
  // thing this endpoint discloses. No seeds, no other config.
  app.get("/config", () => Response.json(deps.publicKeys));

  return app;
}
