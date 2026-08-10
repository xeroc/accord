/**
 * Server contract suite (bean accord-z50v — "Test server").
 *
 * Covers the HTTP-layer contracts the server owns (ADR-0011 §HTTP API,
 * milestone §6 Test Matrix): route mapping, status-code reflection, rate-limit
 * triggers, accounting-key neutrality, content cap, and TLS config wiring.
 *
 * The server is exercised via injected stub handlers — the server's job is to
 * map handler results to HTTP, not to perform crypto. The crypto/end-to-end
 * §6 cases (decryptable-by-juror-only, tampered-bundle alert, ciphertext-only
 * storage) are owned by the unit-crypto bean (accord-c07y) and the e2e bean
 * (accord-xh6n); here we assert the server reflects each handler result code
 * faithfully and enforces its own invariants (rate limit, accounting key,
 * body cap, address shape).
 */
import { describe, expect, it } from "bun:test";
import { createApp } from "./app.js";
import type { ServerDeps } from "./handlers.js";
import { loadServerConfig } from "../config.js";

// 32x '1' — valid base58 charset + length, opaque to the server.
const ADDR = "11111111111111111111111111111111";

function makeDeps(overrides: Partial<ServerDeps> = {}): ServerDeps {
  return {
    ingest: async () => ({ ok: true, status: 201, location: `/evidence/s/d` }),
    deliver: async () => ({
      ok: true,
      status: 200,
      body: { rounds: [{ round: 0, out: "b3V0", operator_ephem_pub: "cHVi" }] },
    }),
    health: async () => ({ ok: true }),
    ...overrides,
  };
}

function post(body: unknown, sub = ADDR, disp = ADDR): Request {
  return new Request(`http://x/evidence/${sub}/${disp}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/* ------------------------------------------------------------------ POST -- */

describe("POST /evidence/:subaccord/:dispute", () => {
  it("happy → 201 + Location", async () => {
    const app = createApp(makeDeps());
    const res = await app.request(post({ ct: "x" }));
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe("/evidence/s/d");
    expect(await res.text()).toBe(""); // no body on 201
  });

  it("handler conflict (different plaintext_hash) → 409", async () => {
    const app = createApp(
      makeDeps({
        ingest: async () => ({
          ok: false,
          status: 409,
          error: "hash mismatch",
        }),
      }),
    );
    const res = await app.request(post({}));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("hash mismatch");
  });

  it("handler bad-bundle → 400", async () => {
    const app = createApp(
      makeDeps({
        ingest: async () => ({ ok: false, status: 400, error: "bad" }),
      }),
    );
    const res = await app.request(post({}));
    expect(res.status).toBe(400);
  });

  it("non-json body → 400 (server rejects before handler)", async () => {
    const app = createApp(makeDeps());
    const res = await app.request(
      new Request(`http://x/evidence/${ADDR}/${ADDR}`, {
        method: "POST",
        body: "not-json{",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("malformed subaccord → 400", async () => {
    const app = createApp(makeDeps());
    const res = await app.request(post({}, "notbase58!", ADDR));
    expect(res.status).toBe(400);
  });

  it("malformed dispute → 400", async () => {
    const app = createApp(makeDeps());
    const res = await app.request(post({}, ADDR, "notbase58!"));
    expect(res.status).toBe(400);
  });
});

/* ------------------------------------------------------------------- GET -- */

describe("GET /evidence/:dispute/for/:juror", () => {
  it("happy → 200 + delivery payload", async () => {
    const app = createApp(makeDeps());
    const res = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rounds: { round: number; out: string; operator_ephem_pub: string }[];
    };
    expect(body.rounds).toHaveLength(1);
    expect(body.rounds[0]!.round).toBe(0);
    expect(body.rounds[0]!.out).toBe("b3V0");
    expect(body.rounds[0]!.operator_ephem_pub).toBe("cHVi");
  });

  it("not drawn / premature → 404 (handler signal)", async () => {
    const app = createApp(
      makeDeps({
        deliver: async () => ({ ok: false, status: 404, error: "not drawn" }),
      }),
    );
    const res = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`);
    expect(res.status).toBe(404);
  });

  it("integrity-gate failure → 409 (handler signal)", async () => {
    const app = createApp(
      makeDeps({
        deliver: async () => ({ ok: false, status: 409, error: "gate fail" }),
      }),
    );
    const res = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`);
    expect(res.status).toBe(409);
  });

  it("malformed juror → 400", async () => {
    const app = createApp(makeDeps());
    const res = await app.request(`http://x/evidence/${ADDR}/for/bad!`);
    expect(res.status).toBe(400);
  });
});

/* --------------------------------------------------------------- /healthz -- */

describe("GET /healthz", () => {
  it("probe ok → 200", async () => {
    const app = createApp(makeDeps({ health: async () => ({ ok: true }) }));
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
  });

  it("probe degraded → 503 (LB drains)", async () => {
    const app = createApp(makeDeps({ health: async () => ({ ok: false, detail: "s3 down" }) }));
    const res = await app.request("/healthz");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toBe("s3 down");
  });
});

/* ----------------------------------------------------------- rate limit --- */

describe("rate limit (per peer IP)", () => {
  it("429 + Retry-After once the per-minute cap is hit", async () => {
    const app = createApp(makeDeps(), { rateLimitPerMin: 2 });
    const h = { "x-forwarded-for": "10.0.0.1" };
    const r1 = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`, {
      headers: h,
    });
    const r2 = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`, {
      headers: h,
    });
    const r3 = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`, {
      headers: h,
    });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.headers.get("retry-after")).toBe("60");
  });

  it("limits are isolated per peer IP", async () => {
    const app = createApp(makeDeps(), { rateLimitPerMin: 1, trustProxy: true });
    const a = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`, {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    const b = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`, {
      headers: { "x-forwarded-for": "10.0.0.2" },
    });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200); // different IP — not throttled
  });

  it("disabled when rateLimitPerMin = 0", async () => {
    const app = createApp(makeDeps(), { rateLimitPerMin: 0 });
    const h = { "x-forwarded-for": "10.0.0.9" };
    for (let i = 0; i < 10; i++) {
      const r = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`, {
        headers: h,
      });
      expect(r.status).toBe(200);
    }
  });
});

/* -------------------------------------------------- accounting-only key --- */

describe("X-Account-Key (accounting only — never grants or denies)", () => {
  it("succeeds with no key header at all", async () => {
    const app = createApp(makeDeps(), { accountKeyEnabled: true });
    const res = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`);
    expect(res.status).toBe(200);
  });

  it("succeeds with any key value — key does not gate access", async () => {
    const app = createApp(makeDeps(), { accountKeyEnabled: true });
    const res = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`, {
      headers: { "x-account-key": "literally-anything" },
    });
    expect(res.status).toBe(200);
  });

  it("is observed (logged) when present and enabled", async () => {
    const seen: string[] = [];
    const app = createApp(makeDeps(), {
      accountKeyEnabled: true,
      log: (msg) => seen.push(msg),
    });
    await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`, {
      headers: { "x-account-key": "k1" },
    });
    expect(seen).toContain("account-key");
  });

  it("disabled by default — key is ignored entirely", async () => {
    const seen: string[] = [];
    const app = createApp(makeDeps(), { log: (msg) => seen.push(msg) });
    await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`, {
      headers: { "x-account-key": "k1" },
    });
    expect(seen).not.toContain("account-key");
  });
});

/* --------------------------------------------------------- body-size cap -- */

describe("content-length cap", () => {
  it("over-cap → 413", async () => {
    const app = createApp(makeDeps(), { maxBytes: 16 });
    const res = await app.request(
      new Request(`http://x/evidence/${ADDR}/${ADDR}`, {
        method: "POST",
        body: "x".repeat(100),
        headers: {
          "content-type": "application/json",
          "content-length": "100",
        },
      }),
    );
    expect(res.status).toBe(413);
  });
});

/* --------------------------------------- server hardening (accord-bsgp) -- */

describe("XFF trust gate (accord-bsgp)", () => {
  it("XFF ignored by default — direct client can't spoof to evade the limiter", async () => {
    const app = createApp(makeDeps(), { rateLimitPerMin: 1 }); // trustProxy unset
    const a = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`, {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    // Same bucket ("unknown") regardless of spoofed XFF → throttled.
    const b = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`, {
      headers: { "x-forwarded-for": "10.0.0.2" },
    });
    expect(a.status).toBe(200);
    expect(b.status).toBe(429);
  });

  it("XFF honored when trustProxy is set (trusted-LB mode)", async () => {
    const app = createApp(makeDeps(), { rateLimitPerMin: 1, trustProxy: true });
    const a = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`, {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    const b = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`, {
      headers: { "x-forwarded-for": "10.0.0.2" },
    });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200); // distinct IPs now → not throttled
  });
});

describe("body-cap chunked/streamed bypass (accord-bsgp)", () => {
  it("POST with no Content-Length under a cap → 411 (closes chunked bypass)", async () => {
    const app = createApp(makeDeps(), { maxBytes: 16 });
    const req = new Request(`http://x/evidence/${ADDR}/${ADDR}`, {
      method: "POST",
      body: "x".repeat(100),
      headers: { "content-type": "application/json" },
    });
    req.headers.delete("content-length"); // simulate chunked/streamed
    const res = await app.request(req);
    expect(res.status).toBe(411);
  });

  it("GET (no body) is unaffected by the cap — no Content-Length rejection", async () => {
    const app = createApp(makeDeps(), { maxBytes: 16 });
    const res = await app.request(`http://x/evidence/${ADDR}/for/${ADDR}`);
    expect(res.status).toBe(200);
  });

  it("cap dormant when maxBytes = 0 — POST without Content-Length passes through", async () => {
    const app = createApp(makeDeps(), { maxBytes: 0 });
    const req = new Request(`http://x/evidence/${ADDR}/${ADDR}`, {
      method: "POST",
      body: JSON.stringify({ ct: "x" }),
      headers: { "content-type": "application/json" },
    });
    req.headers.delete("content-length");
    const res = await app.request(req);
    expect(res.status).toBe(201);
  });
});

/* ------------------------------------------------------------- TLS wiring -- */

describe("TLS config wiring", () => {
  // The server boots plain-HTTP when EVIDENCE_TLS_CERT/KEY are unset and TLS
  // when both are set (ADR-0011). A live TLS handshake is exercised by the
  // e2e bean (accord-xh6n); here we assert the config-driven decision.
  it("no TLS env → plain HTTP (empty tls config)", () => {
    const cfg = loadServerConfig({ EVIDENCE_PORT: "8080" });
    expect(cfg.tls.certPath).toBeUndefined();
    expect(cfg.tls.keyPath).toBeUndefined();
  });

  it("both TLS paths set → tls config populated", () => {
    const cfg = loadServerConfig({
      EVIDENCE_TLS_CERT: "/tls/cert.pem",
      EVIDENCE_TLS_KEY: "/tls/key.pem",
    });
    expect(cfg.tls.certPath).toBe("/tls/cert.pem");
    expect(cfg.tls.keyPath).toBe("/tls/key.pem");
  });

  it("only one TLS path set → still plain (both required)", () => {
    const cfg = loadServerConfig({ EVIDENCE_TLS_CERT: "/tls/cert.pem" });
    expect(cfg.tls.certPath).toBeUndefined();
    expect(cfg.tls.keyPath).toBeUndefined();
  });
});
