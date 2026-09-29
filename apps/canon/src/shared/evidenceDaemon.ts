/**
 * evidenceDaemon.ts — evidence daemon URL selection (canon side, ADR-0011).
 *
 * Three Vite env vars pick the daemon per cluster (empty/unset → default):
 *   VITE_EVIDENCE_DAEMON_URL_DEVNET   default https://api.devnet.useaccord.xyz
 *   VITE_EVIDENCE_DAEMON_URL_MAINNET  default https://api.useaccord.xyz
 *   VITE_EVIDENCE_DAEMON_URL_LOCALNET default <the resolved devnet value>
 */

export interface EvidenceDaemonUrls {
  devnet: string;
  mainnet: string;
  localnet: string;
}

/** Env shape the URLs resolve from — every key optional. */
export type EvidenceDaemonEnv = {
  VITE_EVIDENCE_DAEMON_URL_DEVNET?: string;
  VITE_EVIDENCE_DAEMON_URL_MAINNET?: string;
  VITE_EVIDENCE_DAEMON_URL_LOCALNET?: string;
};

/** Resolve per-cluster daemon URLs from env (unit-tested in
 * evidenceDaemon.test.ts). */
export function evidenceDaemonUrlsFromEnv(
  env: EvidenceDaemonEnv,
): EvidenceDaemonUrls {
  const devnet =
    env.VITE_EVIDENCE_DAEMON_URL_DEVNET || "https://api.devnet.useaccord.xyz";
  return {
    devnet,
    mainnet:
      env.VITE_EVIDENCE_DAEMON_URL_MAINNET || "https://api.useaccord.xyz",
    localnet: env.VITE_EVIDENCE_DAEMON_URL_LOCALNET || devnet,
  };
}

/** Pure cluster-id → daemon-URL mapping (unit-tested in
 * evidenceDaemon.test.ts). */
export function evidenceDaemonUrlForCluster(
  clusterId: string | undefined,
  urls: EvidenceDaemonUrls,
): string {
  switch (clusterId) {
    case "solana:mainnet":
      return urls.mainnet;
    case "solana:localnet":
      return urls.localnet;
    default:
      // devnet + no cluster active yet (ConnectorKit boot)
      return urls.devnet;
  }
}
