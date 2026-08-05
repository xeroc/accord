/**
 * Entry point — wires concrete handlers into the app and starts Bun.serve.
 *
 * The handlers below are stubs that 503 until the pipeline beans land:
 *   - ingest  → accord-r9km (POST handler)
 *   - deliver → accord-4swo  (GET handler)
 *   - health  → accord-u1pu  (/healthz probe)
 * Bean accord-zv7j (pipeline epic) is the integration point: when its handlers
 * exist, swap the stubs for the real imports here. The ServerDeps seam keeps
 * that a one-function change.
 */
import { createApp } from "./server/app.js";
import { createHealthProbe } from "./server/health.js";
import type { DeliverResult, IngestResult, ServerDeps } from "./server/handlers.js";
import { loadServerConfig } from "./config.js";

const NOT_WIRED = "evidence pipeline not wired (see bean accord-zv7j)";

const stubIngest = async (): Promise<IngestResult> => ({
  ok: false,
  status: 409,
  error: NOT_WIRED,
});
const stubDeliver = async (): Promise<DeliverResult> => ({
  ok: false,
  status: 409,
  error: NOT_WIRED,
});

// SEAM (accord-udiu / accord-h1v2): real storage HEAD-bucket + RPC getHealth
// pings land with the store and chain-reader beans. Until then the probe
// reports degraded (503) — honest, and the LB drains.
const stubStoragePing = async (): Promise<boolean> => false;
const stubRpcPing = async (): Promise<boolean> => false;

function main(): void {
  const cfg = loadServerConfig();
  const health = createHealthProbe({
    storage: stubStoragePing,
    rpc: stubRpcPing,
    timeoutMs: cfg.healthTimeoutMs,
  });
  const deps: ServerDeps = {
    ingest: stubIngest,
    deliver: stubDeliver,
    health,
  };

  const app = createApp(deps, {
    rateLimitPerMin: cfg.rateLimitPerMin,
    maxBytes: cfg.maxEvidenceBytes,
    accountKeyEnabled: cfg.accountKeyEnabled,
    trustProxy: cfg.trustProxy,
    log: (msg, fields) => console.log(JSON.stringify({ msg, ...fields })),
  });

  const hasTls = cfg.tls.certPath !== undefined && cfg.tls.keyPath !== undefined;
  const tls = hasTls
    ? {
        cert: Bun.file(cfg.tls.certPath as string),
        key: Bun.file(cfg.tls.keyPath as string),
      }
    : undefined;

  if (!hasTls) {
    // ponytail: TLS is mandatory in prod (ADR-0011); plain HTTP only for local dev.
    console.warn("EVIDENCE_TLS_CERT/KEY not set — serving plain HTTP (dev only)");
  }

  const server = Bun.serve({
    port: cfg.port,
    fetch: app.fetch,
    ...(tls !== undefined ? { tls } : {}),
  });

  console.log(
    JSON.stringify({
      msg: "evidence-daemon listening",
      port: server.port,
      tls: hasTls,
    }),
  );
}

main();
