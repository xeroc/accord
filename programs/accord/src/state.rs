//! Account state structs for the Accord (SPEC account/PDA table).
//!
//! Every account stores its canonical `bump` so instruction handlers reuse the
//! same PDA (never re-derive). Large accounts (`Dispute`, `Round`) are
//! `Box<>`-wrapped at the instruction site to fit the BPF stack frame — the
//! structs themselves are plain `#[account]` types.

use crate::constants::{MAX_JURORS, MAX_OPTIONS};
use anchor_lang::prelude::*;

/// A specialized Juror pool. Permissionless; `staking_token`, windows, `alpha`,
/// `min_stake`, `fee_per_juror`, `authority`, and `evidence_operator` are mutable
/// via propose/execute (ADR-0005); `risk_type` and `evidence_spec` are immutable.
///
/// Seeds: `["subaccord", creator, risk_type]`.
#[account]
#[derive(InitSpace)]
pub struct Subaccord {
    pub creator: Pubkey,
    pub staking_token: Pubkey, // SPL mint juror capital is staked in (ADR-0002)
    pub min_stake: u64,        // draw eligibility threshold, in `staking_token`
    pub jurors_per_dispute: u32,
    /// Slash factor in basis points (10% = 1000). Incoherent Juror loses
    /// `alpha_bps * min_stake / 10_000` (flat — ADR-0003 consequence).
    pub alpha_bps: u16,
    pub review_window: u64, // seconds
    pub commit_window: u64, // seconds
    pub reveal_window: u64, // seconds
    pub max_appeals: u8,
    pub fee_per_juror: u64, // in `staking_token`
    /// `Pubkey::default()` => immutable. Otherwise signs propose/execute updates.
    pub authority: Pubkey,
    pub evidence_operator: Pubkey, // ADR-0006 trusted re-encryption service
    /// Immutable identity hash: what class of dispute this pool adjudicates.
    pub risk_type: [u8; 32],
    /// Immutable evidence-format spec hash (ADR-0006).
    pub evidence_spec: [u8; 32],
    /// Count of **distinct Jurors with any stake** (`JurorStake.amount > 0`).
    /// Maintained O(1) by `stake`/`unstake` (0→positive increments,
    /// positive→0 decrements). This is a *coarse* intake gate for
    /// `create_dispute`/`appeal` (SPEC edge case: revert if fewer active
    /// distinct stakers than the required panel). It deliberately does NOT track
    /// `min_stake` eligibility — that changes via the 48h timelock and cannot be
    /// recomputed without the O(n) ledger ADR-0003 rejected. Precise eligibility
    /// (amount ≥ min_stake, distinctness) is verified at `draw` against the
    /// finalized Merkle Snapshot.
    pub staker_count: u32,
    pub bump: u8,
}

/// A Juror's staked capital in a Subaccord. `unstake` reverts while
/// `active_draws > 0` (ADR-0003: stake frozen until every drawn dispute settles).
///
/// `last_change_slot` is the Solana slot of the most recent `stake`/`unstake`.
/// It is the anchor-slot witness (ADR-0008): if `last_change_slot <
/// Snapshot.anchor_slot`, the current `amount` equals the anchor-time amount,
/// making the live account its own historical stake witness — no ring buffer
/// or epoch snapshot needed.
///
/// Seeds: `["stake", subaccord, juror]`.
#[account]
#[derive(InitSpace)]
pub struct JurorStake {
    pub subaccord: Pubkey,
    pub juror: Pubkey,
    pub amount: u64,
    pub active_draws: u32, // disputes this juror is currently drawn into
    pub bump: u8,
    pub last_change_slot: u64, // ADR-0008: anchor-slot watermark
}

/// Economics-relevant Subaccord params **frozen at `create_dispute` time**
/// (CONCEPT-REVIEW Ugly 6 / bean accord-4e7p). Every post-filing instruction
/// (`post_snapshot`, `draw`, `finalize_dispute`, `appeal`) reads this frozen
/// copy, never the live `Subaccord`. The 48h timelock (ADR-0005) then governs
/// only FUTURE disputes; an active case is immune to governance changes for
/// its entire life. This is the arbitration-contract principle: parties cannot
/// consent to a process whose economically load-bearing rules may shift
/// ex-post.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub struct CaseTerms {
    pub alpha_bps: u16,
    pub min_stake: u64,
    pub fee_per_juror: u64,
    pub jurors_per_dispute: u32,
    pub review_window: u64,
    pub commit_window: u64,
    pub reveal_window: u64,
    pub max_appeals: u8,
}

/// A case filed by an Arbitrable. Progresses through [`DisputeState`]; the
/// Arbitrable reads `final_ruling` lazily.
///
/// Seeds: `["dispute", filer, nonce]`.
#[account]
#[derive(InitSpace)]
pub struct Dispute {
    pub subaccord: Pubkey,
    pub filer: Pubkey,
    pub nonce: u64,
    pub num_options: u8,
    pub options: [[u8; 32]; MAX_OPTIONS], // option label hashes
    pub evidence_hash: [u8; 32],          // ADR-0006: on-chain evidence commitment
    pub state: DisputeState,
    pub current_round: u32,
    /// Filing-time snapshot of the Subaccord's economics (Ugly 6). Immutable
    /// for the dispute's life; governance changes via ADR-0005 affect only
    /// disputes filed after the change lands.
    pub terms: CaseTerms,
    /// Winning option index once `state == Final`; `u8::MAX` until then.
    /// Sentinel (not `Option<u8>`): keeps the account fixed-size — the SBF
    /// `InitSpace` for `Option<u8>` undercounts its `Some` variant by 1 byte,
    /// which made `finalize_dispute`'s `Some` write overflow the account
    /// (Anchor `AccountDidNotSerialize` #3004). Mirrors `Round`'s u8::MAX
    /// sentinels for `reveals`/`result`.
    pub final_ruling: u8,
    /// Total fee deposited by the filer (N * fee_per_juror at creation; appeals
    /// add to the round's pool). Drives the redistribution economics.
    pub fee_paid: u64,
    /// VRF result committed once via `commit_vrf` (ADR-0009). `None` until
    /// committed; `Some(vrf_result)` after. The draw reads this; the caller
    /// cannot swap it between retries.
    pub committed_vrf: Option<[u8; 32]>,
    pub bump: u8,
}

/// Per-round draw/vote state. One `Round` per dispute round (initial + appeals).
///
/// Seeds: `["round", dispute, round_idx]`.
///
/// `#[zero_copy]`: `Round` is too large for BPF's 4096-byte stack when
/// deserialized via `Account<Round>`. Zero-copy maps the account data buffer
/// directly as the struct — no Borsh (de)serialization, no stack copy.
/// `reveals` and `result` use `u8::MAX` sentinels instead of `Option<u8>`
/// (which is not `Pod`). Fields are reordered (u32 first) + explicit padding
/// to satisfy `bytemuck::Pod` (no implicit gaps).
#[account(zero_copy)]
#[repr(C)]
pub struct Round {
    // --- u32 fields (4-byte aligned, no gaps) ---
    pub round_idx: u32,
    pub juror_count: u32,
    pub commit_count: u32,
    pub reveal_count: u32,
    // --- i64 window deadlines (8-byte aligned at offset 16) ---
    /// Commit opens at this timestamp (= draw_time + review_window).
    pub review_end: i64,
    /// Reveal opens at this timestamp (= review_end + commit_window).
    pub commit_end: i64,
    /// Round can be finalized after this timestamp (= commit_end + reveal_window).
    pub reveal_end: i64,
    // --- u8 fields ---
    pub result: u8, // u8::MAX = not set
    pub bump: u8,
    pub _pad0: [u8; 2], // align next field group to 4
    // --- byte arrays (1-byte aligned) ---
    pub dispute: Pubkey,
    pub jurors: [Pubkey; MAX_JURORS],
    /// `hash(vote, salt, juror_pubkey)` per drawn Juror; `[0;32]` until committed.
    pub commits: [[u8; 32]; MAX_JURORS],
    /// Revealed vote option index per drawn Juror; `u8::MAX` until revealed.
    pub reveals: [u8; MAX_JURORS],
    /// Whether this round's coherence settlement has been applied
    /// (CONCEPT-REVIEW Ugly 5 / bean accord-r6ti). 0 until
    /// `finalize_dispute` (final round) or `settle_round` (prior rounds)
    /// processes it; 1 after. Idempotency guard against double-settlement.
    /// (`u8` not `bool` — `bool` is not `Pod`.)
    pub settled: u8,
    pub _pad1: [u8; 4], // total = multiple of 8 (max alignment = i64)
}

/// A committed Merkle root over the Subaccord's Juror set + cumulative stakes,
/// posted optimistically and protected by a 1-day fraud-proof window
/// (ADR-0003). `anchor_slot` freezes the juror set at `post_snapshot` time
/// (ADR-0008): all fraud predicates compare against state as of this slot, not
/// current chain state.
///
/// Seeds: `["snapshot", dispute, round_idx]`.
#[account]
#[derive(InitSpace)]
pub struct Snapshot {
    pub dispute: Pubkey,
    pub round_idx: u32,
    pub merkle_root: [u8; 32],
    pub poster: Pubkey,
    /// Bond = 1x the dispute's max-appeal fee (forfeited if the root is fraud).
    pub bond: u64,
    /// Unix timestamp after which an unchallenged root is final.
    pub challenge_deadline: i64,
    pub status: SnapshotStatus,
    pub bump: u8,
    /// Slot at which the snapshot was posted (ADR-0008 anchor-slot pattern).
    /// `JurorStake.last_change_slot < anchor_slot` certifies the live amount
    /// equals the anchor-time amount — the witness for omission and wrong-stake
    /// fraud predicates.
    pub anchor_slot: u64,
    /// MST root sum: the total stake committed to by the snapshot tree
    /// (ADR-0009). Used for sortition: `r_i % total_stake` selects a juror.
    pub total_stake: u64,
}

/// Custody record for a single appeal bond (ADR-0004). One `AppealBond` per
/// appeal, created by `appeal`, settled by `finalize_dispute` (forfeit on
/// no-flip) / `claim_appeal_refund` (return on flip). Storing the appeal state
/// here — rather than on `Dispute` — keeps the `Dispute` account small (a
/// larger `Dispute` trips an anchor-litesvm CPI edge case in `finalize_snapshot`).
///
/// Seeds: `["bond", dispute, round_idx]` where `round_idx` is the round the
/// appeal opens (the larger panel).
///
/// `prior_result` is the winning option of the round the appellant sought to
/// flip (the just-resolved `current_round` at appeal time). Flip detection at
/// final settlement is `final_ruling != prior_result`. A no-flip bond is zeroed
/// (`amount = 0`) by `finalize_dispute` as it folds the tokens into the coherent
/// pool; a flipped bond keeps its `amount` until `claim_appeal_refund` returns
/// it and zeroes the record (idempotent).
#[account]
#[derive(InitSpace)]
pub struct AppealBond {
    pub dispute: Pubkey,
    pub round_idx: u32,
    pub appellant: Pubkey,
    pub amount: u64,
    /// Winning option of the round being appealed (set at `appeal` time).
    pub prior_result: u8,
    pub bump: u8,
}

/// A proposed Subaccord parameter update, executable only after the 48h on-chain
/// timelock elapses (ADR-0005). No-op while `Subaccord.authority == default`.
///
/// Seeds: `["update", subaccord, nonce]`.
#[account]
#[derive(InitSpace)]
pub struct PendingUpdate {
    pub subaccord: Pubkey,
    pub nonce: u64,
    pub proposed: UpdatePayload,
    pub proposed_by: Pubkey, // == Subaccord.authority at propose time
    /// Earliest slot at which `execute_subaccord_update` may land.
    pub execute_after_slot: u64,
    pub bump: u8,
}

/// Program-level circuit breaker (ADR-0007). Singleton seeded `["pause"]`.
/// `pause()` is instant and authority-gated; `unpause()` is timelocked
/// (`propose_unpause` arms `pending_unpause_after`, `execute_unpause` lands
/// once the slot passes — permissionless, so a freeze is always recoverable on
/// a known schedule). When `paused`, `create_dispute` / `stake` / `appeal`
/// revert; in-flight disputes resolve normally.
#[account]
#[derive(InitSpace)]
pub struct PauseState {
    /// The multisig/upgrade-authority permitted to pause and propose unpause.
    pub authority: Pubkey,
    pub paused: bool,
    /// `Some(slot)` once `propose_unpause` has armed an unpause; cleared on
    /// `execute_unpause` (or on a fresh `pause`).
    pub pending_unpause_after: Option<u64>,
    pub bump: u8,
}

/// Dispute lifecycle (SPEC state machine). A permissionless crank advances
/// states when their windows elapse.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum DisputeState {
    Created,
    SnapshotPosted, // within 1-day challenge window
    Drawn,
    Review,
    Commit,
    Reveal,
    RoundResolved, // round tallied; appeal window or finalization
    Final,         // final ruling set
    Closed,        // fully settled
}

/// Snapshot fraud-proof status (ADR-0003).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum SnapshotStatus {
    Posted,    // challenge window open
    Finalized, // window passed unchallenged — drawable
    Voided,    // fraud proven — root no longer usable
}

/// Tagged Subaccord parameter update. `risk_type` and `evidence_spec` are
/// immutable and intentionally absent (ADR-0005).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace, Debug)]
pub enum UpdatePayload {
    MinStake(u64),
    JurorsPerDispute(u32),
    AlphaBps(u16),
    ReviewWindow(u64),
    CommitWindow(u64),
    RevealWindow(u64),
    MaxAppeals(u8),
    FeePerJuror(u64),
    Authority(Pubkey),
    EvidenceOperator(Pubkey),
}

// --- Draw (ADR-0003/0009; veridao-fr1x/veridao-4nyi) ------------------------

/// Merkle-Sum Tree proof element (ADR-0009). Each level of the proof carries
/// the sibling's hash AND the sibling's stake sum, allowing the chain to verify
/// both structural integrity (hash) and cumulative-range consistency (sum)
/// along the root path.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct MSTNode {
    pub sibling_hash: [u8; 32],
    pub sibling_sum: u64,
}

/// A drawn Juror's MST membership proof: the leaf claim (with cumulative stake),
/// the sibling nodes rootward, and the leaf's position in the tree. The on-chain
/// `draw` verifies each proof against the finalized snapshot root hash + total
/// stake, checks the sortition criterion (`cum_before ≤ r_i < cum_after`),
/// enforces the inflation guard (`JurorStake.amount ≥ leaf.stake`), and
/// enforces distinctness.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct JurorMembership {
    pub leaf: LeafClaim,
    pub proof: Vec<MSTNode>,
    pub index: u32,
}

// --- Snapshot fraud proof (ADR-0003; veridao-rrxs) ---------------------------

/// A single leaf claim from the posted Merkle-Sum tree (ADR-0009). The leaf
/// is hashed as `H(juror || stake_le || cum_after_le)`. `cum_after` is the
/// running stake total up to and including this leaf (in pubkey-sorted order),
/// enabling the on-chain sortition check: `cum_before ≤ r_i < cum_after` where
/// `cum_before = cum_after - stake`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct LeafClaim {
    pub juror: Pubkey,
    pub stake: u64,
    pub cum_after: u64,
}

/// Fraud proof for `challenge_snapshot` (ADR-0003 + ADR-0008 + ADR-0009).
/// Tagged union covering all five on-chain-verifiable fraud classes:
///
/// - `Duplicate` (pred 1): two leaves with the same juror pubkey.
/// - `WrongStake` (pred 3): a leaf whose `stake` differs from the juror's
///   actual anchor-time stake. Requires `JurorStake.last_change_slot <
///   anchor_slot` as the witness.
/// - `NotSorted` (pred 5): two leaves at indices i < j where
///   `leaf[i].juror > leaf[j].juror` — proves the tree is not sorted by pubkey,
///   which breaks omission proofs. Forces sorted trees.
/// - `Omission` (pred 2): two adjacent sorted leaves bracketing the challenger's
///   pubkey + the challenger's JurorStake showing `last_change_slot <
///   anchor_slot` and `amount > 0` — proves the snapshot omitted a staked juror.
///
/// Inflation (pred 4, leaf overstates stake) is enforced at `draw` time via
/// `JurorStake.amount >= leaf.stake`, which is race-immune.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum FraudProof {
    /// Two leaves at different indices with the same juror pubkey, both
    /// verifying against the snapshot root.
    Duplicate {
        leaf_a: LeafClaim,
        proof_a: Vec<MSTNode>,
        index_a: u32,
        leaf_b: LeafClaim,
        proof_b: Vec<MSTNode>,
        index_b: u32,
    },
    /// A leaf whose `stake` field doesn't match the juror's actual stake at
    /// the anchor slot. The challenger passes the juror's `JurorStake` as
    /// `remaining_accounts[0]`.
    WrongStake {
        leaf: LeafClaim,
        proof: Vec<MSTNode>,
        index: u32,
    },
    /// Two leaves at indices `index_lo < index_hi` where
    /// `leaf_lo.juror > leaf_hi.juror` — proves the tree is not sorted by
    /// pubkey ascending, which breaks omission proofs.
    NotSorted {
        leaf_lo: LeafClaim,
        proof_lo: Vec<MSTNode>,
        index_lo: u32,
        leaf_hi: LeafClaim,
        proof_hi: Vec<MSTNode>,
        index_hi: u32,
    },
    /// Two adjacent leaves (consecutive indices) where
    /// `leaf_lo.juror < challenger.key() < leaf_hi.juror` — proves the
    /// challenger is not in the tree. Combined with the challenger's
    /// `JurorStake` (`remaining_accounts[0]`) showing `last_change_slot <
    /// anchor_slot` and `amount > 0`, proves the snapshot omitted a staked juror.
    Omission {
        leaf_lo: LeafClaim,
        proof_lo: Vec<MSTNode>,
        index_lo: u32,
        leaf_hi: LeafClaim,
        proof_hi: Vec<MSTNode>,
        index_hi: u32,
    },
}
