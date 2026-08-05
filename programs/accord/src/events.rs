//! Accord events. Emitted by each instruction for off-chain indexers; future
//! instruction beans add the events they fire (only `HealthChecked` exists today
//! alongside the `health` harness anchor).

use crate::state::UpdatePayload;
use anchor_lang::prelude::*;

/// Emitted when a Subaccord is created.
#[event]
pub struct SubaccordCreated {
    pub creator: Pubkey,
    pub subaccord: Pubkey,
    pub staking_token: Pubkey,
    pub risk_type: [u8; 32],
}

/// Emitted when a Juror stakes capital into a Subaccord.
#[event]
pub struct Staked {
    pub subaccord: Pubkey,
    pub juror: Pubkey,
    pub amount: u64,
}

/// Emitted when a Juror withdraws capital from a Subaccord.
#[event]
pub struct Unstaked {
    pub subaccord: Pubkey,
    pub juror: Pubkey,
    pub amount: u64,
}

/// Emitted when an authority proposes a parameter update (ADR-0005).
#[event]
pub struct UpdateProposed {
    pub subaccord: Pubkey,
    pub nonce: u64,
    pub payload: UpdatePayload,
    pub execute_after_slot: u64,
}

/// Emitted when a timelocked update is executed.
#[event]
pub struct UpdateExecuted {
    pub subaccord: Pubkey,
    pub nonce: u64,
}

/// Emitted when an Arbitrable files a Dispute.
#[event]
pub struct DisputeCreated {
    pub dispute: Pubkey,
    pub subaccord: Pubkey,
    pub filer: Pubkey,
    pub num_options: u8,
}

/// Emitted when a Snapshot root is posted (ADR-0003).
#[event]
pub struct SnapshotPosted {
    pub dispute: Pubkey,
    pub round_idx: u32,
    pub merkle_root: [u8; 32],
    pub poster: Pubkey,
}

/// Emitted when a Snapshot is successfully challenged (fraud proven).
#[event]
pub struct SnapshotChallenged {
    pub dispute: Pubkey,
    pub round_idx: u32,
    pub challenger: Pubkey,
}

/// Emitted when a Snapshot becomes drawable (challenge window passed).
#[event]
pub struct SnapshotFinalized {
    pub dispute: Pubkey,
    pub round_idx: u32,
}

/// Emitted when the VRF result is committed for a dispute (ADR-0009).
/// `commit_vrf_callback` is one-shot; `draw` reads the committed value immutably.
#[event]
pub struct VrfCommitted {
    pub dispute: Pubkey,
    pub vrf_result: [u8; 32],
}

/// Emitted when a VRF request is submitted to the oracle (ADR-0009/veridao-crbf).
#[event]
pub struct VrfRequested {
    pub dispute: Pubkey,
}

/// Emitted after a draw selects the round's Jurors. `vrf_seed` is the
/// deterministic hash binding the VRF result to this specific
/// dispute + round, providing an on-chain audit trail for the off-chain
/// sortition.
#[event]
pub struct JurorsDrawn {
    pub dispute: Pubkey,
    pub round_idx: u32,
    pub jurors: Vec<Pubkey>,
    pub vrf_seed: [u8; 32],
}

/// Emitted on each Juror commit.
#[event]
pub struct Committed {
    pub dispute: Pubkey,
    pub round_idx: u32,
    pub juror: Pubkey,
}

/// Emitted on each Juror reveal.
#[event]
pub struct Revealed {
    pub dispute: Pubkey,
    pub round_idx: u32,
    pub juror: Pubkey,
    pub vote: u8,
}

/// Emitted when a round is tallied.
#[event]
pub struct RoundResolved {
    pub dispute: Pubkey,
    pub round_idx: u32,
    pub result: u8,
}

/// Emitted when a dispute reaches its final ruling (Arbitrable reads this).
#[event]
pub struct RulingFinalized {
    pub dispute: Pubkey,
    pub ruling: u8,
}

/// Emitted on appeal (ADR-0004: permissionless). `bond` is the appeal bond
/// custodied alongside the new round's juror fee (forfeited on no-flip,
/// returned on flip at `finalize_dispute`).
#[event]
pub struct Appealed {
    pub dispute: Pubkey,
    pub new_round_idx: u32,
    pub appellant: Pubkey,
    pub bond: u64,
}

// --- circuit breaker (ADR-0007) ---

/// Emitted when the program is paused (instant, authority-gated).
#[event]
pub struct Paused {
    pub authority: Pubkey,
}

/// Emitted when an unpause is armed (authority-gated); `execute_after_slot` is
/// the earliest slot `execute_unpause` may land.
#[event]
pub struct UnpauseProposed {
    pub execute_after_slot: u64,
}

/// Emitted once the timelocked unpause lands (permissionless crank).
#[event]
pub struct Unpaused {
    pub authority: Pubkey,
}
