//! Canon events. Emitted by state transitions for off-chain indexers.

use anchor_lang::prelude::*;

/// Emitted by `submit_item` when a `CanonItem` is filed (`Pending`).
#[event]
pub struct ItemSubmitted {
    pub list: Pubkey,
    pub item: Pubkey,
    /// The curated account (a PDA owned by `list_program`, or arbitrary base58
    /// when the sentinel is set).
    pub account: Pubkey,
    pub submitter: Pubkey,
    /// Actual deposit locked (fee-on-transfer safe).
    pub deposit: u64,
    /// Submitter's evidence commitment for this item.
    pub evidence: [u8; 32],
}

/// Emitted by `advance_pending` when an unchallenged item auto-lists.
#[event]
pub struct ItemListed {
    pub list: Pubkey,
    pub item: Pubkey,
    pub account: Pubkey,
}

/// Emitted by `challenge_item` when a challenge is filed and the item enters
/// `Disputed`.
#[event]
pub struct ItemChallenged {
    pub list: Pubkey,
    pub item: Pubkey,
    pub challenger: Pubkey,
    /// The Accord `Dispute` PDA resolving this challenge.
    pub dispute: Pubkey,
    /// Stake locked by the challenger (`challenge_pct × accumulated_stake`).
    pub challenge_stake: u64,
    /// Accord round-1 fee forwarded to the backing Subaccord.
    pub accord_fee: u64,
    /// The challenger's evidence commitment for this dispute.
    pub evidence: [u8; 32],
}

/// Emitted by `request_withdrawal` when an item enters `WithdrawPending`.
#[event]
pub struct WithdrawalRequested {
    pub list: Pubkey,
    pub item: Pubkey,
    pub submitter: Pubkey,
    pub withdrawal_requested_at: i64,
}

/// Emitted by `advance_withdrawal` when the timelock elapses unchallenged and
/// the accumulated stake is returned to the submitter (item → Removed).
#[event]
pub struct Withdrawn {
    pub list: Pubkey,
    pub item: Pubkey,
    pub submitter: Pubkey,
    pub amount: u64,
}

/// Emitted by `settle_item` when a dispute resolves and funds are redistributed.
#[event]
pub struct ItemSettled {
    pub list: Pubkey,
    pub item: Pubkey,
    /// 0 = keep, 1 = remove (index into Accord options).
    pub ruling: u8,
    /// True if the item was in WithdrawPending when challenged.
    pub is_withdrawal: bool,
    /// The challenger's locked stake.
    pub challenge_stake: u64,
    /// accumulated_stake before settlement (for indexer reconciliation).
    pub accumulated_before_settlement: u64,
}
