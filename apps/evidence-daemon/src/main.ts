/**
 * Entry point — composition root (bean accord-tzmm). Constructs every concrete
 * module from the environment and wires them into the HTTP server via
 * {@link createServerDeps}. Stateless: N replicas share the same
 * EVIDENCE_KEYRING env + storage backend (S3 bucket or a shared FS root);
 * no process-local state (ADR-0011 §HA).
 *
 * Startup is fail-loud: loadConfig + EnvKeyring.fromEnv throw on any missing
 * required var or a zero-key keyring (bean accord-qycb) — the daemon never
 * boots into a silently-404s-everything state.
 *
 * Plaintext is never persisted: the storage backend (S3/MinIO or local FS)
 * holds ciphertext only; plaintext exists ephemerally in memory during
 * delivery (ADR-0006).
 */
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { address, type TransactionSigner } from "@solana/kit";
import { Accord } from "@useaccord/sdk";
import { mkdirSync } from "node:fs";
import { stat } from "node:fs/promises";

import { loadConfig, loadServerConfig } from "./config.js";
import { EnvKeyring } from "./keys/keyring.js";
import type { EvidenceStore } from "./store/store.js";
import { FsStore } from "./store/fs.js";
import { S3Store } from "./store/s3.js";
import { createServerDeps } from "./wire.js";
import { createApp } from "./server/app.js";
import { createHealthProbe } from "./server/health.js";

/**
 * Read-only RPC needs an `Accord` (which takes a signer for its write path),
 * but the daemon writes nothing on-chain. This signer throws if ever asked to
 * sign — fail-loud rather than silently impersonate a fee payer.
 */
function readOnlySigner(): TransactionSigner {
  const signTransactions = async (): Promise<never> => {
    throw new Error("evidence-daemon is read-only; signTransactions must never be called");
  };
  // The Kit TransactionSigner generic is painful to satisfy literally for a
  // stub that never runs; the shape ({ address, signTransactions }) is correct.
  return {
    address: address("11111111111111111111111111111111"),
    signTransactions,
  } as unknown as TransactionSigner;
}

function main(): void {
  // Full env (keyring, S3, RPC, program id, TLS) — throws on missing/malformed.
  const cfg = loadConfig();
  // Server tuning subset (rate limit, body cap, XFF, health timeout).
  const srv = loadServerConfig();

  // qycb: zero-key keyring throws here, before the server accepts traffic.
  const keyring = EnvKeyring.fromEnv(cfg.keyring);

  // Storage backend — local filesystem (EVIDENCE_STORAGE=fs) or S3 (default).
  // Only the selected backend is constructed; the other's env vars are never
  // read, so an fs deployment needs no S3 credentials (and vice versa).
  let store: EvidenceStore;
  let storagePing: () => Promise<boolean>;
  if (cfg.storage.kind === "fs") {
    // Pre-create the root so /healthz is green from boot (the store creates
    // parent dirs lazily per-object, but the probe stat()s the root itself).
    mkdirSync(cfg.storage.fs.rootDir, { recursive: true });
    const root = cfg.storage.fs.rootDir;
    store = new FsStore({ rootDir: root });
    storagePing = async () => {
      try {
        return (await stat(root)).isDirectory();
      } catch {
        return false;
      }
    };
  } else {
    const s3Client = new S3Client({
      region: cfg.storage.s3.region,
      endpoint: cfg.storage.s3.endpoint,
      ...(cfg.storage.s3.accessKeyId !== undefined
        ? {
            credentials: {
              accessKeyId: cfg.storage.s3.accessKeyId,
              secretAccessKey: cfg.storage.s3.secretAccessKey!,
            },
          }
        : {}),
      ...(cfg.storage.s3.forcePathStyle ? { forcePathStyle: true } : {}),
    });
    const bucket = cfg.storage.s3.bucket;
    store = new S3Store({ client: s3Client, bucket });
    storagePing = async () => {
      try {
        await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
        return true;
      } catch {
        return false;
      }
    };
  }

  const accord = new Accord({ endpoint: cfg.rpcUrl, signer: readOnlySigner() });

  // /healthz: probe storage + RPC. LB drains on a non-ok result.
  const rpcPing = async (): Promise<boolean> => {
    try {
      await accord.rpc.getHealth();
      return true;
    } catch {
      return false;
    }
  };
  const health = createHealthProbe({
    storage: storagePing,
    rpc: rpcPing,
    timeoutMs: srv.healthTimeoutMs,
  });

  const deps = createServerDeps({ store, accord, keyring, health });

  const app = createApp(deps, {
    rateLimitPerMin: srv.rateLimitPerMin,
    maxBytes: srv.maxEvidenceBytes,
    accountKeyEnabled: srv.accountKeyEnabled,
    trustProxy: srv.trustProxy,
    log: (msg, fields) => console.log(JSON.stringify({ msg, ...fields })),
  });

  const hasTls = cfg.tls !== undefined;
  if (!hasTls) {
    // TLS is mandatory in prod (ADR-0011); plain HTTP only for local dev.
    console.warn("EVIDENCE_TLS_CERT/KEY not set — serving plain HTTP (dev only)");
  }
  const tls = hasTls ? { cert: Bun.file(cfg.tls!.cert), key: Bun.file(cfg.tls!.key) } : undefined;

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
      operators: keyring.size,
    }),
  );
}

main();
