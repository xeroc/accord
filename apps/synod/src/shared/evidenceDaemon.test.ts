/**
 * config.test.ts — evidence daemon URLs resolve per cluster from Vite env.
 *
 * Defaults: devnet daemon for devnet AND localnet (unless LOCALNET is set
 * explicitly), mainnet daemon for mainnet. Empty/unset vars fall through.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evidenceDaemonUrlForCluster,
  evidenceDaemonUrlsFromEnv,
} from "./evidenceDaemon";

test("URLs resolve from env with deployment defaults", () => {
  const urls = evidenceDaemonUrlsFromEnv({});
  assert.equal(urls.devnet, "https://api.devnet.useaccord.xyz");
  assert.equal(urls.mainnet, "https://api.useaccord.xyz");
  // localnet shares the devnet daemon by default.
  assert.equal(urls.localnet, urls.devnet);
});

test("per-cluster env vars win; empty string falls through; localnet falls back to devnet", () => {
  const urls = evidenceDaemonUrlsFromEnv({
    VITE_EVIDENCE_DAEMON_URL_DEVNET: "http://devnet.daemon:8080",
    VITE_EVIDENCE_DAEMON_URL_MAINNET: "",
  });
  assert.equal(urls.devnet, "http://devnet.daemon:8080");
  assert.equal(urls.mainnet, "https://api.useaccord.xyz");
  // LOCALNET unset → the resolved devnet value.
  assert.equal(urls.localnet, "http://devnet.daemon:8080");

  const explicit = evidenceDaemonUrlsFromEnv({
    VITE_EVIDENCE_DAEMON_URL_LOCALNET: "http://localhost:8787",
  });
  assert.equal(explicit.localnet, "http://localhost:8787");
});

test("daemon URL maps cluster id", () => {
  const urls = evidenceDaemonUrlsFromEnv({});
  assert.equal(
    evidenceDaemonUrlForCluster("solana:mainnet", urls),
    "https://api.useaccord.xyz",
  );
  assert.equal(
    evidenceDaemonUrlForCluster("solana:devnet", urls),
    "https://api.devnet.useaccord.xyz",
  );
  assert.equal(
    evidenceDaemonUrlForCluster("solana:localnet", urls),
    "https://api.devnet.useaccord.xyz",
  );
  // No cluster active yet (ConnectorKit boot) — devnet daemon.
  assert.equal(
    evidenceDaemonUrlForCluster(undefined, urls),
    "https://api.devnet.useaccord.xyz",
  );
});
