/**
 * useEvidenceDaemonUrl — the evidence daemon base URL for the active
 * ConnectorKit cluster (config.ts env-driven mapping). Re-renders on cluster
 * switches via useCluster().
 */
import { useCluster } from "@solana/connector";

import {
  evidenceDaemonUrlForCluster,
  evidenceDaemonUrlsFromEnv,
} from "./config";

export function useEvidenceDaemonUrl(): string {
  const { cluster } = useCluster();
  return evidenceDaemonUrlForCluster(
    cluster?.id,
    evidenceDaemonUrlsFromEnv(import.meta.env),
  );
}
