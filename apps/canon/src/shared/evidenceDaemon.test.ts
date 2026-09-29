/**
 * evidenceDaemon.test.ts — cluster-dependent evidence service config.
 *
 * Daemon URLs and operator pubkeys resolve per cluster from Vite env.
 * URL defaults: devnet daemon for devnet AND localnet (unless LOCALNET is
 * set), mainnet daemon for mainnet. Operator default is "" (no operator);
 * localnet falls back to the devnet value. Empty/unset vars fall through.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  valueForCluster,
  evidenceDaemonUrlsFromEnv,
  evidenceOperatorsFromEnv,
} from "./evidenceDaemon";

test("daemon URLs resolve from env with deployment defaults", () => {
  const urls = evidenceDaemonUrlsFromEnv({});
  assert.equal(urls.devnet, "https://api.devnet.useaccord.xyz");
  assert.equal(urls.mainnet, "https://api.useaccord.xyz");
  // localnet shares the devnet daemon by default.
  assert.equal(urls.localnet, urls.devnet);
});

test("per-cluster URL vars win; empty string falls through; localnet falls back to devnet", () => {
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

test("operators resolve from env; unset = no operator; localnet falls back to devnet", () => {
  const none = evidenceOperatorsFromEnv({});
  assert.equal(none.devnet, "");
  assert.equal(none.mainnet, "");
  assert.equal(none.localnet, "");

  const ops = evidenceOperatorsFromEnv({
    VITE_EVIDENCE_OPERATOR_ADDRESS_DEVNET: "DevnetOperatorPubkey1111111111111111111",
    VITE_EVIDENCE_OPERATOR_ADDRESS_MAINNET: "",
  });
  assert.equal(ops.devnet, "DevnetOperatorPubkey1111111111111111111");
  assert.equal(ops.mainnet, "");
  assert.equal(ops.localnet, "DevnetOperatorPubkey1111111111111111111");

  const explicit = evidenceOperatorsFromEnv({
    VITE_EVIDENCE_OPERATOR_ADDRESS_LOCALNET: "LocalnetOperatorPubkey1111111111111111",
  });
  assert.equal(explicit.localnet, "LocalnetOperatorPubkey1111111111111111");
});

test("valueForCluster maps cluster id (devnet is the boot default)", () => {
  const urls = evidenceDaemonUrlsFromEnv({});
  assert.equal(
    valueForCluster("solana:mainnet", urls),
    "https://api.useaccord.xyz",
  );
  assert.equal(
    valueForCluster("solana:devnet", urls),
    "https://api.devnet.useaccord.xyz",
  );
  assert.equal(
    valueForCluster("solana:localnet", urls),
    "https://api.devnet.useaccord.xyz",
  );
  // No cluster active yet (ConnectorKit boot) — devnet value.
  assert.equal(
    valueForCluster(undefined, urls),
    "https://api.devnet.useaccord.xyz",
  );

  const ops = evidenceOperatorsFromEnv({
    VITE_EVIDENCE_OPERATOR_ADDRESS_DEVNET: "DevnetOperatorPubkey1111111111111111111",
    VITE_EVIDENCE_OPERATOR_ADDRESS_MAINNET: "MainnetOperatorPubkey11111111111111111",
    VITE_EVIDENCE_OPERATOR_ADDRESS_LOCALNET: "LocalnetOperatorPubkey1111111111111111",
  });
  assert.equal(valueForCluster("solana:mainnet", ops), ops.mainnet);
  assert.equal(valueForCluster("solana:localnet", ops), ops.localnet);
  assert.equal(valueForCluster("solana:devnet", ops), ops.devnet);
});
