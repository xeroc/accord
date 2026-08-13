/**
 * shared/index.ts — barrel export for the Canon app's shared utilities.
 *
 * Consumers import from `@/shared`. Mirrors apps/app/src/shared/index.ts.
 *
 * Note: `findAllCanonLists` / `CANON_ITEM_LIST_OFFSET` live in `./fetch`
 * (re-exported here); `findAllCanonItemsByList` / `fetchCanonListRaw` live in
 * `./rpc`. `useSigner` / `ZERO_ADDRESS` live in `./wallet` (not `./rpc`, which
 * also defines them for direct `@/shared/rpc` importers) — kept to one source
 * per symbol in the barrel to avoid a re-export collision.
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
  DISPUTE_STATE_LABELS,
  formatRuling,
  formatTimestamp,
  shortAddress,
  shortenAddress,
  formatBigInt,
  formatTokenAmount,
  formatHash,
  formatWindow,
  timeRemaining,
  formatBps,
} from "./format";
export { sendInstruction, TransactionSendError } from "./transaction";
export {
  TOKEN_PROGRAM_ADDRESS,
  TOKEN_2022_PROGRAM_ADDRESS,
  getAtaAddress,
} from "./tokens";
export { useSigner, ZERO_ADDRESS, type SignerState } from "./wallet";
export { unwrapError, describeError } from "./errors";
