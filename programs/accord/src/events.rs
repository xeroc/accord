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

/// Emitted after a draw selects the round's Jurors.
#[event]
pub struct JurorsDrawn {
    pub dispute: Pubkey,
    pub round_idx: u32,
    pub jurors: Vec<Pubkey>,
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

/// Emitted on appeal (ADR-0004: permissionless).
#[event]
pub struct Appealed {
    pub dispute: Pubkey,
    pub new_round_idx: u32,
}
