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
import { address, type Address, type TransactionSigner } from "@solana/kit";
import { Accord } from "@useaccord/sdk";
import { mkdirSync } from "node:fs";
import { stat } from "node:fs/promises";

import { loadConfig, loadServerConfig } from "./config.js";
import { EnvKeyring } from "./keys/keyring.js";
import type { EvidenceStore } from "./store/store.js";
import { FsStore } from "./store/fs.js";
import { S3Store } from "./store/s3.js";
import type { DeliveryKeyStore } from "./store/delivery-key.js";
import { FsDeliveryKeyStore } from "./store/delivery-key-fs.js";
import { S3DeliveryKeyStore } from "./store/delivery-key-s3.js";
import type { DomainStore } from "./store/domain.js";
import { FsDomainStore } from "./store/domain-fs.js";
import { S3DomainStore } from "./store/domain-s3.js";
import type { TraceStore } from "./store/trace.js";
import { FsTraceStore } from "./store/trace-fs.js";
import { S3TraceStore } from "./store/trace-s3.js";
import { traceEnvelopeOf, type TraceBatch } from "./store/trace.js";
import { WatchHub, watchRoutes, websocketHandlers, type WatchSocketData } from "./server/watch.js";
import { createServerDeps } from "./wire.js";
import { createApp } from "./server/app.js";
import { createHealthProbe } from "./server/health.js";
import { TraceTokenService, traceTokenRoutes } from "./server/trace-token.js";
import { buildKeyringPublicKeys } from "./server/public-keys.js";
import { readDispute } from "./chain/reader.js";

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

  // Operator Ed25519 public keys served at GET /config (ADR-0011). The pubkeys
  // are public (== on-chain evidence_operator); the seeds stay in the keyring.
  const publicKeys = buildKeyringPublicKeys(keyring);

  // Storage backend — local filesystem (EVIDENCE_STORAGE=fs) or S3 (default).
  // Only the selected backend is constructed; the other's env vars are never
  // read, so an fs deployment needs no S3 credentials (and vice versa).
  let store: EvidenceStore;
  let storagePing: () => Promise<boolean>;
  let domainStore: DomainStore;
  let deliveryKeyStore: DeliveryKeyStore;
  let traceStore: TraceStore;
  if (cfg.storage.kind === "fs") {
    // Pre-create the root so /healthz is green from boot (the store creates
    // parent dirs lazily per-object, but the probe stat()s the root itself).
    mkdirSync(cfg.storage.fs.rootDir, { recursive: true });
    const root = cfg.storage.fs.rootDir;
    store = new FsStore({ rootDir: root });
    domainStore = new FsDomainStore({ rootDir: root });
    deliveryKeyStore = new FsDeliveryKeyStore({ rootDir: root });
    traceStore = new FsTraceStore({ rootDir: root });
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
    store = new S3Store({
      client: s3Client,
      bucket,
      ...(cfg.storage.s3.serverSideEncryption
        ? { serverSideEncryption: cfg.storage.s3.serverSideEncryption }
        : {}),
      ...(cfg.storage.s3.kmsKeyId ? { kmsKeyId: cfg.storage.s3.kmsKeyId } : {}),
    });
    domainStore = new S3DomainStore({
      client: s3Client,
      bucket,
      ...(cfg.storage.s3.serverSideEncryption
        ? { serverSideEncryption: cfg.storage.s3.serverSideEncryption }
        : {}),
      ...(cfg.storage.s3.kmsKeyId ? { kmsKeyId: cfg.storage.s3.kmsKeyId } : {}),
    });
    deliveryKeyStore = new S3DeliveryKeyStore({ client: s3Client, bucket });
    traceStore = new S3TraceStore({ client: s3Client, bucket });
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

  // Jury telemetry (ADR-0037): the trace store is the durable replay source
  // (GET /trace answers on any replica); the hub adds LIVE frames on this
  // replica only (locked: fan-out state is single-replica in-memory).
  const hub = new WatchHub({
    ...(srv.traceBufferPerDispute !== undefined
      ? { bufferPerDispute: srv.traceBufferPerDispute }
      : {}),
    ...(srv.traceMaxClientsPerIp !== undefined
      ? { maxClientsPerIp: srv.traceMaxClientsPerIp }
      : {}),
    replay: traceStore,
  });
  const traceFanout = (batch: TraceBatch): void => {
    hub.publish(
      batch.dispute,
      batch.events.map((e) => traceEnvelopeOf(batch, e)),
    );
  };

  // ADR-0037 read gate: one token service shared by the mint route, GET
  // /trace (via ServerDeps) and the WS /watch authorize seam below.
  const traceTokens = new TraceTokenService();

  const deps = createServerDeps({
    store,
    domainStore,
    deliveryKeyStore,
    traceStore,
    traceFanout,
    maxDomainBytes: srv.maxDomainBytes,
    maxEntries: srv.maxEntries,
    maxDocBytes: srv.maxDocBytes,
    maxPackageBytes: srv.maxPackageBytes,
    accord,
    keyring,
    health,
    publicKeys,
    traceTokens,
  });

  const app = createApp(deps, {
    rateLimitPerMin: srv.rateLimitPerMin,
    maxBytes: srv.maxEvidenceBytes,
    traceEnabled: srv.traceEnabled,
    accountKeyEnabled: srv.accountKeyEnabled,
    trustProxy: srv.trustProxy,
    log: (msg, fields) => console.log(JSON.stringify({ msg, ...fields })),
    corsOrigin: srv.corsOrigin,
  });

  const hasTls = cfg.tls !== undefined;
  if (!hasTls) {
    // TLS is mandatory in prod (ADR-0011); plain HTTP only for local dev.
    console.warn("EVIDENCE_TLS_CERT/KEY not set — serving plain HTTP (dev only)");
  }
  const tls = hasTls ? { cert: Bun.file(cfg.tls!.cert), key: Bun.file(cfg.tls!.key) } : undefined;

  // WS /watch gate (ADR-0037, inveigo ADR-0013 amendment): same rule as GET
  // /trace — the durable public stamp (flipped by jurat via POST
  // /trace-public on a FLIP commit) OR a valid filer token.
  const authorizeWatch = async (dispute: string, token: string | undefined): Promise<boolean> => {
    try {
      if (await traceStore.isPublic(dispute as Address)) return true;
    } catch {
      // unreadable stamp ⇒ fall through to the token check
    }
    return traceTokens.verify(dispute, token);
  };

  // TDZ-safe: watchRoutes closes over `server`; the binding is set right after
  // listen, before any upgrade request can arrive.
  // eslint-disable-next-line prefer-const -- closure reads the binding before its assignment (TDZ)
  let server: Bun.Server<WatchSocketData> | undefined;
  app.route(
    "/",
    watchRoutes(hub, () => server, authorizeWatch),
  );
  app.route(
    "/",
    traceTokenRoutes({
      tokens: traceTokens,
      readDispute: (d) => readDispute(accord, d),
    }),
  );
  server = Bun.serve<WatchSocketData>({
    port: cfg.port,
    fetch: app.fetch,
    websocket: websocketHandlers(hub),
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
