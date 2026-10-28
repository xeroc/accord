/**
 * Composition-root pins for jury telemetry (ADR-0037). The route/handler
 * units (server/trace.ts, server/watch.ts) each passed their own tests, but
 * createServerDeps never wired the read side — every replica 404ed
 * "trace replay not enabled" on GET /trace/:dispute while the beans read
 * "completed". These tests boot the FULL deps set (real fs stores, real
 * keyring, real handlers) so an unwired seam fails here, not in devnet.
 *
 * Only the chain reader stays offline: no route exercised here touches it.
 */
import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bs58 from "bs58";
import { Accord } from "@useaccord/sdk";
import type { TransactionSigner } from "@solana/kit";

import { EnvKeyring } from "./keys/keyring.js";
import { FsStore } from "./store/fs.js";
import { FsDomainStore } from "./store/domain-fs.js";
import { FsDeliveryKeyStore } from "./store/delivery-key-fs.js";
import { FsTraceStore } from "./store/trace-fs.js";
import { createServerDeps } from "./wire.js";
import { createApp } from "./server/app.js";
import { TraceTokenService } from "./server/trace-token.js";
import { buildKeyringPublicKeys } from "./server/public-keys.js";

const DISPUTE = "Jura111111111111111111111111111111111111111";

function stubSigner(): TransactionSigner {
  return {
    address: "11111111111111111111111111111111",
    signTransactions: async (): Promise<never> => {
      throw new Error("read-only signer");
    },
  } as unknown as TransactionSigner;
}

/** Full deps over a fresh fs root — the same shape main() assembles. */
function makeApp() {
  const dir = mkdtempSync(join(tmpdir(), "evidence-wire-"));
  const keyring = EnvKeyring.fromEnv(
    `${bs58.encode(new Uint8Array(32).fill(1))},${bs58.encode(new Uint8Array(32).fill(2))}`,
  );
  const traceTokens = new TraceTokenService();
  const deps = createServerDeps({
    store: new FsStore({ rootDir: dir }),
    domainStore: new FsDomainStore({ rootDir: dir }),
    deliveryKeyStore: new FsDeliveryKeyStore({ rootDir: dir }),
    traceStore: new FsTraceStore({ rootDir: dir }),
    maxDomainBytes: 1024,
    maxEntries: 64,
    maxDocBytes: 1024,
    maxPackageBytes: 4096,
    accord: new Accord({ endpoint: "http://127.0.0.1:9", signer: stubSigner() }),
    keyring,
    health: async () => ({ ok: true }),
    publicKeys: buildKeyringPublicKeys(keyring),
    traceTokens,
  });
  return { app: createApp(deps, { traceEnabled: true }), dir, traceTokens };
}

describe("createServerDeps wires the trace read side (ADR-0037)", () => {
  it("GET /trace/:dispute serves the filer with a token, 401s tokenless (read gate)", async () => {
    const { app, dir, traceTokens } = makeApp();
    try {
      // Fresh record is private (no public stamp): tokenless 401 proves the
      // gate deps are wired; the filer token then opens the (empty) record.
      const denied = await app.request(`http://x/trace/${DISPUTE}`);
      expect(denied.status).toBe(401);
      const { token } = traceTokens.mint(DISPUTE);
      const res = await app.request(`http://x/trace/${DISPUTE}?token=${token}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
