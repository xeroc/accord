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
#[account]
#[derive(InitSpace)]
pub struct Round {
    pub dispute: Pubkey,
    pub round_idx: u32,
    pub jurors: [Pubkey; MAX_JURORS],
    /// `hash(vote, salt, juror_pubkey)` per drawn Juror; `[0;32]` until committed.
    pub commits: [[u8; 32]; MAX_JURORS],
    /// Revealed vote option index per drawn Juror; `None` until revealed.
    pub reveals: [Option<u8>; MAX_JURORS],
    pub juror_count: u32,
    pub commit_count: u32,
    pub reveal_count: u32,
    /// Winning option index for this round once tallied.
    pub result: Option<u8>,
    pub bump: u8,
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
