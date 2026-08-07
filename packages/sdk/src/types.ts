/**
 * Domain types for the Accord.
 *
 * Re-exports the Codama-generated type modules (DisputeState, UpdatePayload,
 * LeafClaim, MSTNode) which are sourced directly from
 * `programs/accord/src/state.rs`. No hand-written duplicates — the generated
 * tree is the single source of truth for on-chain shapes.
 *
 * ADR-0012: `SnapshotStatus` / `FraudProof` are gone (snapshot layer deleted);
 * `LeafClaim` carries only `(juror, stake)` — the cumulative-from-left prefix
 * used for sortition is reconstructed from the authenticated sibling sums.
 */

export {
  DisputeState,
  getDisputeStateDecoder,
  getDisputeStateEncoder,
} from "./generated/types/disputeState.js";

export {
  Aggregation,
  type AggregationArgs,
  getAggregationCodec,
} from "./generated/types/aggregation.js";

export {
  type UpdatePayload,
  getUpdatePayloadCodec,
} from "./generated/types/updatePayload.js";

export {
  type LeafClaim as LeafClaimIdl,
  getLeafClaimCodec,
} from "./generated/types/leafClaim.js";
export {
  type MSTNode as MSTNodeIdl,
  getMSTNodeCodec,
} from "./generated/types/mSTNode.js";
