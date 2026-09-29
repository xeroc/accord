/**
 * useEvidenceDaemonUrl — the evidence daemon base URL for the active
 * ConnectorKit cluster (evidenceDaemon.ts env-driven mapping). Re-renders on
 * cluster switches via useCluster().
 */
import { useCluster } from "@solana/connector";

import {
  evidenceDaemonUrlForCluster,
  evidenceDaemonUrlsFromEnv,
} from "./evidenceDaemon";

export function useEvidenceDaemonUrl(): string {
  const { cluster } = useCluster();
  return evidenceDaemonUrlForCluster(
    cluster?.id,
    evidenceDaemonUrlsFromEnv(import.meta.env),
  );
}
