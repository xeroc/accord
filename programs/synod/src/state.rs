//! Account state for Synod (SPEC §Account/PDA model + §Case state machine).
//!
//! Synod is an Arbitrable over Accord: it owns the party roster + escrow pot;
//! Accord owns juror staking, the VRF draw, commit-reveal voting, and the
//! ruling. Synod reuses Accord's `Dispute`/`Round`/`JurorStake` + the hosting
//! `Subaccord` — it does not reimplement voting.
//!
//! Every account stores its canonical `bump` so instruction handlers reuse the
//! same PDA (never re-derive).

use anchor_lang::prelude::*;

use crate::constants::MAX_PARTIES;

/// Lifecycle of a case (SPEC §Case state machine).
///
/// v1 ships three variants. `Refunding` is deliberately NOT a variant: a roster
/// miss refunds every joined party inside `refund_roster_miss` and lands
/// directly in `Closed` (per-party `paid_out` bits carry the idempotency).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum CaseState {
    /// Roster filling; parties join until full or `join_deadline` passes.
    Opening,
    /// Full roster joined; the Accord dispute is filed and resolving.
    Live,
    /// All outstanding per-party payouts settled. Terminal.
    Closed,
}

/// An N-party dispute escrow (SPEC §Account model).
///
/// Seeds: `["case", opener, nonce]`. `parties` is naming order with the opener
/// at index 0; unused tail slots carry `Pubkey::default()`. The Accord option
/// for party `i` is index `i`, the neutral option is the highest index
/// `party_count` — `parties` order IS the option mapping (SPEC §Invariants 4).
#[account]
#[derive(InitSpace)]
pub struct SynodCase {
    /// The hosting Accord Subaccord (fee_token + frozen fee source).
    pub subaccord: Pubkey,
    /// Party roster in naming order; opener = index 0. Slots ≥ `party_count`
    /// are `Pubkey::default()` padding.
    pub parties: [Pubkey; MAX_PARTIES],
    /// Number of live parties, `MIN_PARTIES..=MAX_PARTIES` (2..=7).
    pub party_count: u8,
    /// Bitmask of joined parties: bit `i` set ⇒ `parties[i]` staked `S`.
    pub joined: u8,
    /// Per-party stake `S` (`subaccord.fee_token`). The only economic dial.
    pub stake: u64,
    /// **Frozen at open**: `initial_num_jurors · fee_per_juror` read once from
    /// the Subaccord. Never re-read at file — governance can't shift the deal
    /// mid-window (SPEC §Account model).
    pub fee: u64,
    /// Unix timestamp after which an incomplete roster refunds (Clock
    /// unix_time).
    pub join_deadline: i64,
    /// Per-party evidence hash, written at `join` (slot frozen at join; late
    /// evidence rides appeal rounds, ADR-0023, via independent appeal).
    /// Slots ≥ `party_count` are `[0u8; 32]` padding.
    pub evidence: [[u8; 32]; MAX_PARTIES],
    /// The Accord `Dispute` PDA (`["dispute", case, 0]`); `Pubkey::default()`
    /// sentinel until `file_dispute` binds it (immutable after — SPEC
    /// §Invariants 2).
    pub dispute: Pubkey,
    /// Bitmask of settled payouts: bit `i` set ⇒ `parties[i]` received its
    /// claim. Idempotency for `refund_roster_miss` + `claim` (pull-only, SPEC
    /// §Invariants 3).
    pub paid_out: u8,
    /// Current lifecycle stage.
    pub state: CaseState,
    pub bump: u8,
}
