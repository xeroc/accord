/**
 * evidenceDaemon.ts — evidence service config (canon side, ADR-0011).
 *
 * Daemon URLs and operator pubkeys resolve per cluster from Vite env
 * (empty/unset → default):
 *   VITE_EVIDENCE_DAEMON_URL_DEVNET   default https://api.devnet.useaccord.xyz
 *   VITE_EVIDENCE_DAEMON_URL_MAINNET  default https://api.useaccord.xyz
 *   VITE_EVIDENCE_DAEMON_URL_LOCALNET default <the resolved devnet value>
 *   VITE_EVIDENCE_OPERATOR_ADDRESS_DEVNET   default "" (no operator)
 *   VITE_EVIDENCE_OPERATOR_ADDRESS_MAINNET  default "" (no operator)
 *   VITE_EVIDENCE_OPERATOR_ADDRESS_LOCALNET default <the resolved devnet value>
 */

/** One value per selectable cluster. */
export type PerCluster<T> = {
  devnet: T;
  mainnet: T;
  localnet: T;
};

/** Cluster-id → value. Devnet is the default for unknown ids and the
 * no-cluster-yet boot frame (ConnectorKit). Unit-tested in
 * evidenceDaemon.test.ts. */
export function valueForCluster<T>(
  clusterId: string | undefined,
  values: PerCluster<T>,
): T {
  switch (clusterId) {
    case "solana:mainnet":
      return values.mainnet;
    case "solana:localnet":
      return values.localnet;
    default:
      return values.devnet;
  }
}

export type EvidenceDaemonEnv = {
  VITE_EVIDENCE_DAEMON_URL_DEVNET?: string;
  VITE_EVIDENCE_DAEMON_URL_MAINNET?: string;
  VITE_EVIDENCE_DAEMON_URL_LOCALNET?: string;
};

/** Resolve per-cluster daemon URLs from env (unit-tested in
 * evidenceDaemon.test.ts). */
export function evidenceDaemonUrlsFromEnv(
  env: EvidenceDaemonEnv,
): PerCluster<string> {
  const devnet =
    env.VITE_EVIDENCE_DAEMON_URL_DEVNET || "https://api.devnet.useaccord.xyz";
  return {
    devnet,
    mainnet:
      env.VITE_EVIDENCE_DAEMON_URL_MAINNET || "https://api.useaccord.xyz",
    localnet: env.VITE_EVIDENCE_DAEMON_URL_LOCALNET || devnet,
  };
}

export type EvidenceOperatorEnv = {
  VITE_EVIDENCE_OPERATOR_ADDRESS_DEVNET?: string;
  VITE_EVIDENCE_OPERATOR_ADDRESS_MAINNET?: string;
  VITE_EVIDENCE_OPERATOR_ADDRESS_LOCALNET?: string;
};

/**
 * Resolve per-cluster evidence-operator pubkeys (base58) from env.
 * "" = no operator (the on-chain zero sentinel); unset defaults to "" — each
 * deployment pins the keys its daemons actually run in their keyrings.
 * Localnet falls back to the devnet value unless set explicitly.
 */
export function evidenceOperatorsFromEnv(
  env: EvidenceOperatorEnv,
): PerCluster<string> {
  const devnet = env.VITE_EVIDENCE_OPERATOR_ADDRESS_DEVNET || "";
  return {
    devnet,
    mainnet: env.VITE_EVIDENCE_OPERATOR_ADDRESS_MAINNET || "",
    localnet: env.VITE_EVIDENCE_OPERATOR_ADDRESS_LOCALNET || devnet,
  };
}
