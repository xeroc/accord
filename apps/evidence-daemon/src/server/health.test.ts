/**
 * /healthz probe self-check (bean accord-u1pu). Exercises the probe logic —
 * parallel checks, per-check timeout, error isolation, 200/503 mapping — with
 * injected boolean pings.
 */
import { describe, expect, it } from "bun:test";
import { createApp } from "./app.js";
import { createHealthProbe } from "./health.js";
import type { ServerDeps } from "./handlers.js";
import { loadServerConfig } from "../config.js";

function okDeps(health: ServerDeps["health"]): ServerDeps {
  return {
    ingest: async () => ({ ok: true, status: 201, location: "/evidence/x/y" }),
    deliver: async () => ({
      ok: true,
      status: 200,
      body: { rounds: [{ round: 0, out: "b3V0", operator_ephem_pub: "cHVi" }] },
    }),
    health,
  };
}

/** Type-safe accessor for the degraded-case detail string. */
function detail(
  res: { readonly ok: true } | { readonly ok: false; readonly detail: string },
): string {
  if (res.ok) throw new Error("expected degraded, got ok");
  return res.detail;
}

describe("health probe", () => {
  it("both reachable → ok", async () => {
    const probe = createHealthProbe({
      storage: async () => true,
      rpc: async () => true,
    });
    const res = await probe();
    expect(res.ok).toBe(true);
  });

  it("storage down → degraded + detail", async () => {
    const probe = createHealthProbe({
      storage: async () => false,
      rpc: async () => true,
    });
    const res = await probe();
    expect(res.ok).toBe(false);
    expect(detail(res)).toContain("storage");
  });

  it("rpc throws → degraded + error detail", async () => {
    const probe = createHealthProbe({
      storage: async () => true,
      rpc: async () => {
        throw new Error("conn refused");
      },
    });
    const res = await probe();
    expect(res.ok).toBe(false);
    expect(detail(res)).toContain("rpc");
    expect(detail(res)).toContain("conn refused");
  });

  it("check hangs → timed out counts as unreachable", async () => {
    const probe = createHealthProbe({
      storage: async () => true,
      rpc: () => new Promise<boolean>(() => {}),
      timeoutMs: 30,
    });
    const res = await probe();
    expect(res.ok).toBe(false);
    expect(detail(res)).toContain("rpc");
  });

  it("both fail → both listed", async () => {
    const probe = createHealthProbe({
      storage: async () => false,
      rpc: async () => false,
    });
    const res = await probe();
    expect(res.ok).toBe(false);
    expect(detail(res)).toContain("storage");
    expect(detail(res)).toContain("rpc");
  });
});

describe("healthz route mapping", () => {
  it("ok probe → 200 via app", async () => {
    const health = createHealthProbe({
      storage: async () => true,
      rpc: async () => true,
    });
    const app = createApp(okDeps(health));
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
  });

  it("degraded probe → 503 via app", async () => {
    const health = createHealthProbe({
      storage: async () => false,
      rpc: async () => true,
    });
    const app = createApp(okDeps(health));
    const res = await app.request("/healthz");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toContain("storage");
  });
});

describe("config timeout wiring", () => {
  it("respects EVIDENCE_HEALTH_TIMEOUT_MS", () => {
    const cfg = loadServerConfig({ EVIDENCE_HEALTH_TIMEOUT_MS: "500" });
    expect(cfg.healthTimeoutMs).toBe(500);
  });
});
