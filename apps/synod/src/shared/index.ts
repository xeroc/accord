/**
 * shared/index.ts — barrel export for the Synod dApp's shared utilities.
 *
 * Consumers import from `@/shared`. Mirrors apps/canon/src/shared/index.ts.
 */

export { CLUSTERS, DEFAULT_CLUSTER_ID, type ClusterConfig } from "./cluster";
export {
  useSynod,
  type SynodEnv,
  useClusterRpc,
  type ClusterRpc,
} from "./rpc";
export { findAllSynodCases } from "./fetch";
export {
  DISPUTE_STATE_LABELS,
  formatRuling,
  formatTimestamp,
  formatHash,
  formatWindow,
  timeRemaining,
  timeAgo,
  shortAddress,
  shortenAddress,
  formatAmount,
} from "./format";
export { sendInstruction, TransactionSendError } from "./transaction";
export {
  TOKEN_PROGRAM_ADDRESS,
  TOKEN_2022_PROGRAM_ADDRESS,
  getAtaAddress,
} from "./tokens";
export { useSigner, ZERO_ADDRESS, type SignerState } from "./wallet";
export { unwrapError, describeError } from "./errors";
