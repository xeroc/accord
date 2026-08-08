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
