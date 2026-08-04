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
/// Seeds: `["stake", subaccord, juror]`.
#[account]
#[derive(InitSpace)]
pub struct JurorStake {
    pub subaccord: Pubkey,
    pub juror: Pubkey,
    pub amount: u64,
    pub active_draws: u32, // disputes this juror is currently drawn into
    pub bump: u8,
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
    /// Winning option index once `state == Final`; `None` until then.
    pub final_ruling: Option<u8>,
    /// Total fee deposited by the filer (N * fee_per_juror at creation; appeals
    /// add to the round's pool). Drives the redistribution economics.
    pub fee_paid: u64,
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
    pub _pad1: [u8; 5], // total = multiple of 8 (max alignment = i64)
}

/// A committed Merkle root over the Subaccord's Juror set + cumulative stakes,
/// posted optimistically and protected by a 1-day fraud-proof window (ADR-0003).
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

// --- Draw (ADR-0003; veridao-fr1x) -------------------------------------------

/// A drawn Juror's Merkle membership proof: the leaf claim, the sibling hashes
/// rootward, and the leaf's position in the tree. The on-chain `draw` verifies
/// each proof against the finalized snapshot root, checks stake eligibility,
/// and enforces distinctness. The stake-weighted cumulative lookup is computed
/// off-chain; the on-chain program trusts the finalized root (ADR-0003
/// fraud-proof is the trust anchor).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct JurorMembership {
    pub leaf: LeafClaim,
    pub proof: Vec<[u8; 32]>,
    pub index: u32,
}

// --- Snapshot fraud proof (ADR-0003; veridao-rrxs) ---------------------------

/// A single leaf claim from the posted Merkle tree: the Juror pubkey and the
/// stake the leaf attributes to them. On-chain this is hashed
/// `H(juror || stake_le)` to form the leaf node.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct LeafClaim {
    pub juror: Pubkey,
    pub stake: u64,
}

/// Fraud proof for `challenge_snapshot`. Demonstrates the posted root is a false
/// commitment by showing two tree leaves that both verify against the root yet
/// attribute a stake to the **same Juror** (a duplicate / inconsistent entry).
/// This is the one fraud class that is fully verifiable on-chain *without*
/// comparing against live `JurorStake` state (which drifts as Jurors
/// stake/unstake during the 1-day window and would make an honest root
/// challengeable). Duplicating a Juror is also the direct way to skew the
/// cumulative-stake distribution the draw reads, so it is the highest-value
/// fraud to catch. Other fraud classes (wrong stake, missing/extra Juror) need
/// the off-chain dataset and are left to a future richer proof (hardening bean).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct FraudProof {
    pub leaf_a: LeafClaim,
    pub proof_a: Vec<[u8; 32]>, // sibling hashes, rootward
    pub index_a: u32,           // leaf position (bit i = side at level i)
    pub leaf_b: LeafClaim,
    pub proof_b: Vec<[u8; 32]>,
    pub index_b: u32,
}
