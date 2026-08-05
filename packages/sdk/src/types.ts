/**
 * Domain types for the Accord.
 *
 * Re-exports the Codama-generated type modules (DisputeState, SnapshotStatus,
 * UpdatePayload, FraudProof, JurorMembership, LeafClaim, MSTNode) which are
 * sourced directly from `programs/accord/src/state.rs`. No hand-written
 * duplicates — the generated tree is the single source of truth for on-chain
 * shapes.
 */

export {
  type DisputeState,
  getDisputeStateDecoder,
  getDisputeStateEncoder,
} from "./generated/types/disputeState";

export {
  type SnapshotStatus,
  getSnapshotStatusDecoder,
  getSnapshotStatusEncoder,
} from "./generated/types/snapshotStatus";

export {
  type UpdatePayload,
  getUpdatePayloadCodec,
} from "./generated/types/updatePayload";

export {
  type FraudProof,
  getFraudProofCodec,
} from "./generated/types/fraudProof";

export {
  type JurorMembership,
  getJurorMembershipCodec,
} from "./generated/types/jurorMembership";

export { type LeafClaim, getLeafClaimCodec } from "./generated/types/leafClaim";

export { type MSTNode, getMSTNodeCodec } from "./generated/types/mSTNode";
