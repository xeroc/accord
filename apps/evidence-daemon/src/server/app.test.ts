/**
 * Server wiring self-check (bean accord-dyf0). Exercises the HTTP mechanics —
 * routing, status/Location mapping, rate limiting, accounting-only key — with
 * injected stub handlers. The full test matrix (Test matrix §6) belongs to the
 * pipeline + the "Test server" bean (accord-z50v).
 */
import { describe, expect, it } from "bun:test";
import { createApp } from "./app.js";
import type { ServerDeps } from "./handlers.js";

const OK_ADDR = "11111111111111111111111111111111"; // 32x '1', valid base58 charset

function deps(overrides: Partial<ServerDeps> = {}): ServerDeps {
  return {
    ingest: async () => ({ ok: true, status: 201, location: "/evidence/x/y" }),
    deliver: async () => ({
      ok: true,
      status: 200,
      body: { out: "b3V0", operator_ephem_pub: "cHVi" },
    }),
    health: async () => ({ ok: true }),
    ...overrides,
  };
}

describe("evidence routes", () => {
  it("POST ingest → 201 + Location", async () => {
    const app = createApp(deps());
    const res = await app.request(`/evidence/${OK_ADDR}/${OK_ADDR}`, {
      method: "POST",
      body: JSON.stringify({ ct: "x" }),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe("/evidence/x/y");
  });

  it("POST ingest conflict → 409", async () => {
    const app = createApp(
      deps({
        ingest: async () => ({
          ok: false,
          status: 409,
          error: "hash mismatch",
        }),
      }),
    );
    const res = await app.request(`/evidence/${OK_ADDR}/${OK_ADDR}`, {
      method: "POST",
      body: JSON.stringify({ ct: "x" }),
    });
    expect(res.status).toBe(409);
  });

  it("GET deliver → 200 + payload", async () => {
    const app = createApp(deps());
    const res = await app.request(`/evidence/${OK_ADDR}/for/${OK_ADDR}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { out: string };
    expect(body.out).toBe("b3V0");
  });

  it("GET deliver not-drawn → 404", async () => {
    const app = createApp(
      deps({
        deliver: async () => ({ ok: false, status: 404, error: "not drawn" }),
      }),
    );
    const res = await app.request(`/evidence/${OK_ADDR}/for/${OK_ADDR}`);
    expect(res.status).toBe(404);
  });

  it("malformed address → 400", async () => {
    const app = createApp(deps());
    const res = await app.request(`/evidence/notbase58!/${OK_ADDR}`, {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(400);
  });
});

describe("rate limit", () => {
  it("429 after per-minute cap", async () => {
    const app = createApp(deps(), { rateLimitPerMin: 2 });
    const headers = { "x-forwarded-for": "10.0.0.1" };
    const r1 = await app.request(`/evidence/${OK_ADDR}/for/${OK_ADDR}`, {
      headers,
    });
    const r2 = await app.request(`/evidence/${OK_ADDR}/for/${OK_ADDR}`, {
      headers,
    });
    const r3 = await app.request(`/evidence/${OK_ADDR}/for/${OK_ADDR}`, {
      headers,
    });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.headers.get("retry-after")).toBe("60");
  });

  it("accounting-only key never denies", async () => {
    let seen = false;
    const app = createApp(deps(), {
      accountKeyEnabled: true,
      log: (msg) => {
        if (msg === "account-key") seen = true;
      },
    });
    // No key header at all — request must still succeed.
    const res = await app.request(`/evidence/${OK_ADDR}/for/${OK_ADDR}`);
    expect(res.status).toBe(200);
    expect(seen).toBe(false);

    // With key — logged, still succeeds.
    const res2 = await app.request(`/evidence/${OK_ADDR}/for/${OK_ADDR}`, {
      headers: { "x-account-key": "k1" },
    });
    expect(res2.status).toBe(200);
    expect(seen).toBe(true);
  });
});

describe("healthz", () => {
  it("ok → 200", async () => {
    const app = createApp(deps());
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
  });

  it("degraded → 503", async () => {
    const app = createApp(
      deps({ health: async () => ({ ok: false, detail: "s3 down" }) }),
    );
    const res = await app.request("/healthz");
    expect(res.status).toBe(503);
  });
});
