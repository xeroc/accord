/**
 * useEvidenceDaemonUrl.ts — cluster-dependent evidence service hooks.
 *
 * `useEvidenceDaemonUrl()` and `useEvidenceOperator()` resolve the config.ts
 * mappings for the active ConnectorKit cluster; both re-render on cluster
 * switches via useCluster().
 */
import { useCluster } from "@solana/connector";

import {
  valueForCluster,
  evidenceDaemonUrlsFromEnv,
  evidenceOperatorsFromEnv,
} from "./config";

/** Daemon base URL for the active cluster. */
export function useEvidenceDaemonUrl(): string {
  const { cluster } = useCluster();
  return valueForCluster(
    cluster?.id,
    evidenceDaemonUrlsFromEnv(import.meta.env),
  );
}

/** Evidence-operator pubkey (base58) for the active cluster; "" = none. */
export function useEvidenceOperator(): string {
  const { cluster } = useCluster();
  return valueForCluster(
    cluster?.id,
    evidenceOperatorsFromEnv(import.meta.env),
  );
}
