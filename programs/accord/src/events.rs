//! Accord events. Emitted by each instruction for off-chain indexers.

use crate::state::UpdatePayload;
use anchor_lang::prelude::*;

/// Emitted when a Subaccord is created.
#[event]
pub struct SubaccordCreated {
    pub creator: Pubkey,
    pub subaccord: Pubkey,
    pub staking_token: Pubkey,
    pub fee_token: Pubkey,
    pub domain_ref: [u8; 32],
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

/// Emitted when the VRF result is committed for a dispute (ADR-0009/0012).
/// `commit_vrf_callback` is one-shot and atomically freezes the accumulator
/// root; `draw_seat` reads both immutably.
#[event]
pub struct VrfCommitted {
    pub dispute: Pubkey,
    pub vrf_result: [u8; 32],
    /// Accumulator root frozen atomically with the VRF (ADR-0012).
    pub frozen_root: [u8; 32],
}

/// Emitted when a VRF request is submitted to the oracle (ADR-0009/veridao-crbf).
#[event]
pub struct VrfRequested {
    pub dispute: Pubkey,
}

/// Emitted per seat as the per-seat draw fills the panel (ADR-0012). One event
/// per `draw_seat` tx; the round's windows open + the dispute transitions to
/// `Drawn` when the last seat lands.
#[event]
pub struct SeatDrawn {
    pub dispute: Pubkey,
    pub round_idx: u32,
    pub seat: u32,
    pub juror: Pubkey,
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

/// Emitted when a prior round's coherence settlement lands via `settle_round`
/// (CONCEPT-REVIEW Ugly 5 / bean accord-r6ti). The final round emits
/// `RulingFinalized` instead (it carries the ruling write).
#[event]
pub struct RoundSettled {
    pub dispute: Pubkey,
    pub round_idx: u32,
}

/// Emitted on appeal (ADR-0004: permissionless). `bond` is the appeal bond
/// custodied alongside the new round's juror fee (forfeited on no-flip,
/// returned on flip at `finalize_dispute`).
#[event]
pub struct Appealed {
    pub dispute: Pubkey,
    pub new_round_idx: u32,
    pub appellant: Pubkey,
    pub deposit: u64,
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

/// Emitted when a stalled dispute is cancelled via the liveness-escape crank
/// (CONCEPT-REVIEW Ugly 4). `refund` is the filer's round-1 fee returned from
/// the vault; the dispute transitions to the terminal `Failed` state.
#[event]
pub struct DisputeCancelled {
    pub dispute: Pubkey,
    pub filer: Pubkey,
    pub refund: u64,
}

/// Emitted when a juror withdraws aggregate earned fees (ADR-0020).
#[event]
pub struct FeesWithdrawn {
    pub subaccord: Pubkey,
    pub juror: Pubkey,
    pub amount: u64,
}

/// Emitted when a shortfall round is redrawn (ADR-0021). The same-size panel is
/// reconvened with a fresh `draw_attempt` seed; `round_idx` is unchanged.
#[event]
pub struct Redrawn {
    pub dispute: Pubkey,
    pub round_idx: u32,
    pub draw_attempt: u32,
}

/// Emitted when `max_draw_attempts` is exhausted and the dispute transitions to
/// `Failed` (ADR-0021). `refund` is the filer fee returned from the vault;
/// no-shows' accumulated slashes stand, outstanding appeal bonds remain claimable
/// via `claim_appeal_refund`.
#[event]
pub struct DisputeFailedShortfall {
    pub dispute: Pubkey,
    pub filer: Pubkey,
    pub draw_attempt: u32,
    pub refund: u64,
}

/// Emitted when a drained JurorStake's tree slot is pushed onto the free list
/// (RECLAIM-LEAF). The slot's leaf identity is blanked to `(default, 0)` and
/// `tree_index` is linked onto the `Subaccord.free_head` free list.
#[event]
pub struct SlotReclaimed {
    pub subaccord: Pubkey,
    pub juror: Pubkey,
    pub index: u32,
}

/// Emitted when a new staker claims a recycled tree slot from the free list
/// (RECLAIM-LEAF). The freed `JurorStake` is closed (rent → caller).
#[event]
pub struct SlotAllocated {
    pub subaccord: Pubkey,
    pub juror: Pubkey,
    pub index: u32,
}

/// Emitted by `health`. Carries the program version byte.
#[event]
pub struct HealthChecked {
    pub version: u8,
}
