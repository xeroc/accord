/**
 * shared/index.ts — barrel export for the Canon app's shared utilities.
 *
 * Consumers import from `@/shared`. Mirrors apps/app/src/shared/index.ts.
 */

export { CLUSTERS, DEFAULT_CLUSTER_ID, type ClusterConfig } from "./cluster";
export {
  useCanon,
  type CanonEnv,
  useClusterRpc,
  type ClusterRpc,
  findAllCanonItemsByList,
  fetchCanonListRaw,
} from "./rpc";
export {
  fetchCanonList,
  fetchCanonItem,
  findAllCanonLists,
  findAllCanonItems,
  findCanonItemsByList,
  CANON_ITEM_LIST_OFFSET,
  type ScanConfig,
} from "./fetch";
export {
  ITEM_STATE_LABELS,
  shortAddress,
  shortenAddress,
  formatBigInt,
  formatTokenAmount,
  formatHash,
  formatWindow,
  timeRemaining,
  formatBps,
} from "./format";
