/**
 * Hono app assembly: per-IP rate limit, accounting-only X-Account-Key, mounted
 * evidence + /healthz routes. Stateless — safe behind N replicas with no
 * session affinity (ADR-0011 §HA).
 */
import { Hono } from "hono";
import type { ServerDeps } from "./handlers.js";
import { evidenceRoutes } from "./routes.js";

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
  readonly log?: (msg: string, fields?: Record<string, unknown>) => void;
}

interface RateBucket {
  count: number;
  windowStart: number;
}

const MIN_MS = 60_000;

/** Resolve the peer IP. Trusts X-Forwarded-For (LB must set it). */
function peerIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return "unknown";
}

export function createApp(deps: ServerDeps, opts: AppOptions = {}): Hono {
  const app = new Hono();
  const log = opts.log ?? (() => {});
  const perMin = opts.rateLimitPerMin ?? 0;
  const maxBytes = opts.maxBytes ?? 0;
  const accountKeyEnabled = opts.accountKeyEnabled ?? false;

  // ponytail: in-process fixed-window counter — per-replica, not shared.
  // Adequate for basic DoS; a shared limiter (Redis) is a v1+ ops upgrade and
  // does not change the handler contract.
  const buckets = new Map<string, RateBucket>();

  app.use("*", async (c, next) => {
    // Accounting-only key: observe, never enforce (ADR-0006/0011).
    if (accountKeyEnabled) {
      const key = c.req.header("x-account-key");
      if (key) log("account-key", { key, ip: peerIp(c.req.raw) });
    }

    if (maxBytes > 0) {
      const len = Number(c.req.raw.headers.get("content-length") ?? 0);
      if (len > maxBytes) {
        return Response.json({ error: "request too large" }, { status: 413 });
      }
    }

    if (perMin > 0) {
      const ip = peerIp(c.req.raw);
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

  // /healthz — bean accord-u1pu implements the real S3+RPC probe; the server
  // boots with this stub so main() serves immediately.
  app.get("/healthz", async (c) => {
    const res = await deps.health();
    return res.ok
      ? Response.json({ status: "ok" }, { status: 200 })
      : Response.json(
          { status: "degraded", detail: res.detail },
          { status: 503 },
        );
  });

  return app;
}
