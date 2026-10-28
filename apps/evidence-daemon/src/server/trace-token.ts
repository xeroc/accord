/**
 * Trace read tokens (ADR-0037 read gate).
 *
 *   POST /trace-token/{dispute}  body { filer, ts, sig }  → 200 { token, expiresAt }
 *
 * `sig` = hex(Ed25519(utf8(`trace-read:${dispute}:${filer}:${ts}`))) signed by
 * the filer key; `ts` = unix seconds within ±300 of now. The daemon verifies
 * the signature, then that the requester IS the on-chain filer
 * (`readDispute`), then mints a random 32-byte token (5-minute TTL).
 *
 * Tokens ride the URL query `?token=` on GET /trace and the WS /watch upgrade
 * (browsers cannot header a WS upgrade). In-memory Map — single-replica,
 * consistent with ADR-0037's locked fan-out decision
 * (ponytail: multi-replica /trace behind an LB needs signed tokens later).
 */
import { Hono } from "hono";
import { address, type Address } from "@solana/kit";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";

import type { DisputeView } from "../chain/reader.js";
import { ADDRESS } from "./routes.js";

/** Signed message: `trace-read:{dispute}:{filer}:{ts}` (frozen wire format). */
function traceReadMessage(dispute: string, filer: string, ts: number): Uint8Array {
  return new TextEncoder().encode(`trace-read:${dispute}:${filer}:${ts}`);
}

/** Default Ed25519 verifier: filer address (base58) is the public key. */
function verifyEd25519(msg: Uint8Array, sig: Uint8Array, filer: string): boolean {
  try {
    return ed25519.verify(sig, msg, bs58.decode(filer));
  } catch {
    return false;
  }
}

const TOKEN_TTL_MS = 5 * 60_000;
/** Freshness window on the body `ts`, unix seconds. */
const TS_WINDOW_S = 300;
const HEX64 = /^(?:[0-9a-fA-F]{2}){64}$/;

/** Mint/verify short-lived read tokens. Clock injectable for tests. */
export class TraceTokenService {
  private readonly entries = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  mint(dispute: string): { token: string; expiresAt: number } {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const expiresAt = this.now() + TOKEN_TTL_MS;
    this.entries.set(dispute, { token, expiresAt });
    return { token, expiresAt };
  }

  /** True iff the token is the live one for this dispute and unexpired. */
  verify(dispute: string, token: string | undefined): boolean {
    if (token === undefined) return false;
    const e = this.entries.get(dispute);
    if (e === undefined) return false;
    if (this.now() >= e.expiresAt) {
      this.entries.delete(dispute);
      return false;
    }
    return e.token === token;
  }
}

export interface TraceTokenRoutesDeps {
  /** The service the read gates verify against — the route mints into it. */
  readonly tokens: TraceTokenService;
  /** Dispute reader (chain seam): null ⇒ unknown dispute. */
  readonly readDispute: (dispute: Address) => Promise<DisputeView | null>;
  /** Signature verifier (default: Ed25519, filer address = pubkey). */
  readonly verifySig?: (msg: Uint8Array, sig: Uint8Array, filer: string) => boolean;
  /** Clock for the ts freshness window (default Date.now). */
  readonly now?: () => number;
}

export function traceTokenRoutes(deps: TraceTokenRoutesDeps): Hono {
  const app = new Hono();
  const verifySig = deps.verifySig ?? verifyEd25519;
  const now = deps.now ?? Date.now;

  app.post("/trace-token/:dispute", async (c) => {
    const dispute = c.req.param("dispute");
    if (!ADDRESS.test(dispute)) {
      return Response.json({ error: "invalid dispute" }, { status: 400 });
    }
    const body = (await c.req.json().catch(() => null)) as {
      filer?: unknown;
      ts?: unknown;
      sig?: unknown;
    } | null;
    if (body === null || typeof body !== "object") {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    const { filer, ts, sig } = body;
    if (typeof filer !== "string" || !ADDRESS.test(filer)) {
      return Response.json({ error: "invalid filer" }, { status: 400 });
    }
    if (typeof ts !== "number" || !Number.isInteger(ts)) {
      return Response.json({ error: "invalid ts" }, { status: 400 });
    }
    if (Math.abs(ts - Math.floor(now() / 1000)) > TS_WINDOW_S) {
      return Response.json({ error: "stale ts" }, { status: 401 });
    }
    if (typeof sig !== "string" || !HEX64.test(sig)) {
      return Response.json({ error: "invalid sig" }, { status: 400 });
    }
    const sigBytes = new Uint8Array(sig.match(/../g)!.map((h) => parseInt(h, 16)));
    const view = await deps.readDispute(address(dispute));
    if (view === null) {
      return Response.json({ error: "unknown dispute" }, { status: 404 });
    }
    if (view.filer !== filer) {
      return Response.json({ error: "not the filer" }, { status: 403 });
    }
    if (!verifySig(traceReadMessage(dispute, filer, ts), sigBytes, filer)) {
      return Response.json({ error: "bad signature" }, { status: 401 });
    }
    return Response.json(deps.tokens.mint(dispute), { status: 200 });
  });

  return app;
}
