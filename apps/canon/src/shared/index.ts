/**
 * shared/index.ts — barrel export for the Canon app's shared utilities.
 *
 * Mirrors apps/app/src/shared/index.ts. Consumers import from `@/shared`.
 */

export { useCanon, type CanonEnv, useClusterRpc, type ClusterRpc } from "./rpc";
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
  formatHash,
  formatWindow,
  timeRemaining,
  formatBps,
} from "./format";
