//! Account state for Canon (SPEC account/PDA table + state machine).
//!
//! Canon is an Arbitrable over Accord: it owns the item lifecycle + item
//! deposits; Accord owns juror staking, the VRF draw, commit-reveal voting, and
//! the ruling. Canon reuses Accord's `Dispute`/`Round`/`JurorStake` + the
//! per-list backing `Subaccord` — it does not reimplement voting.
//!
//! Every account stores its canonical `bump` so instruction handlers reuse the
//! same PDA (never re-derive).

use anchor_lang::prelude::*;

/// Lifecycle of a curated item (SPEC §Item state machine).
///
/// v1 ships five variants. `WithdrawPending` (a submitter-initiated delist) is
/// challengeable: a challenge re-enters the dispute path and the item is
/// `Removed` either way — the dispute only decides whether the submitter keeps
/// the deposit or forfeits it to the challenger. There is deliberately no
/// `Withdrawn` variant: a completed withdrawal lands the item in `Removed`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ItemState {
    /// Just submitted (+ permanent deposit); inside the `listing_window`.
    Pending,
    /// Auto-listed (unchallenged past `listing_window`) or survived a `keep`
    /// ruling; open to re-challenge. Progressive protection accumulates.
    Listed,
    /// Delisted (lost a `remove` ruling, or withdrawal completed). Terminal.
    Removed,
    /// Submitter requested withdrawal; inside the `withdrawal_timelock`
    /// challenge window.
    WithdrawPending,
    /// A live Accord dispute (keep vs remove) is resolving this item.
    Disputed,
}

/// A permissionless, token-agnostic curated list. `create_list` CPIs Accord
/// `create_subaccord` for the 1:1 backing court and initialises this account
/// with the Canon canonical defaults.
///
/// Seeds: `["canon", creator, rules_hash]`. `rules_hash` + `list_program` are
/// immutable (frozen at creation); the dispute-mechanism economics live on the
/// backing `subaccord` (controlled by its authority via the 48h timelock).
#[account]
#[derive(InitSpace)]
pub struct CanonList {
    /// Seed component + list creator.
    pub creator: Pubkey,
    /// Juror collateral mint — staked/sashed in the backing Subaccord
    /// (ADR-0002/0020). May equal `fee_mint`.
    pub stake_mint: Pubkey,
    /// Compensation mint — Canon registry economics (deposits, bounties) + the
    /// Accord fee (ADR-0020). Default USDC.
    pub fee_mint: Pubkey,
    /// **Immutable.** The program whose accounts this list curates. The item's
    /// `account.owner` must equal this at `submit_item`.
    /// `Pubkey::default()` => ownership check disabled (curate arbitrary base58
    /// data).
    pub list_program: Pubkey,
    /// **Immutable.** Public listing-criteria doc hash jurors apply. Seed
    /// component. Passed to Accord as the backing Subaccord's `risk_type`.
    pub rules_hash: [u8; 32],
    /// The 1:1 backing Accord court that adjudicates this list's item disputes.
    pub subaccord: Pubkey,
    /// Permanent skin-in-the-game locked at `submit_item`, in `fee_mint`.
    pub submit_deposit: u64,
    /// Challenger stake as a fraction (bps) of the item's `accumulated_stake`.
    /// Bounded by `MAX_CHALLENGE_PCT_BPS`.
    pub challenge_pct: u16,
    /// Seconds an item sits `Pending` before auto-listing if unchallenged.
    pub listing_window: u64,
    /// Seconds the `WithdrawPending` fraud-challenge window stays open.
    pub withdrawal_timelock: u64,
    /// Canon governance multisig (set at `create_list`); passed as the backing
    /// Subaccord's authority so it controls dispute-param retuning.
    pub authority: Pubkey,
    /// Count of `CanonItem`s ever filed under this list (PDA-distinctness
    /// guarantee; monotonic, never decremented).
    pub item_count: u32,
    pub bump: u8,
}

/// A single curated entry within a `CanonList`. The `account` is a PDA owned by
/// the list's `list_program`; Canon keys the item off it.
///
/// Seeds: `["canon-item", list, account]`.
#[account]
#[derive(InitSpace)]
pub struct CanonItem {
    /// The curated address — a PDA owned by `CanonList.list_program`.
    pub account: Pubkey,
    /// Back-ref to the owning `CanonList` (seed component).
    pub list: Pubkey,
    /// Who filed the item (locks the deposit; sole withdrawer).
    pub submitter: Pubkey,
    /// Current lifecycle stage.
    pub state: ItemState,
    /// Skin accumulated on this item, in `fee_mint`. Starts at `submit_deposit`;
    /// grows by each forfeited `challenge_stake` on a `keep` ruling (progressive
    /// protection); paid out as the bounty on `remove`.
    pub accumulated_stake: u64,
    /// `submit_item` timestamp (Clock unix_time). Gates `advance_pending`.
    pub submitted_at: i64,
    /// Total challenges ever filed against this item (progressive-protection
    /// history depth).
    pub challenge_count: u32,
    // --- Active-challenge bookkeeping (meaningful only while `state == Disputed`) ---
    /// The Accord `Dispute` PDA resolving the current challenge
    /// (`Pubkey::default()` when not disputed).
    pub active_dispute: Pubkey,
    /// The challenger who filed the current dispute (`Pubkey::default()` when
    /// not disputed; the bounty payee on `remove`).
    pub challenger: Pubkey,
    /// Stake the challenger locked for the current dispute, in `fee_mint`
    /// (`challenge_pct × accumulated_stake`); 0 when not disputed.
    pub challenge_stake: u64,
    /// Timestamp the current challenge was filed (Clock unix_time); 0 when not
    /// disputed.
    pub challenged_at: i64,
    /// When the submitter opened a withdrawal (`request_withdrawal`); gates
    /// `advance_withdrawal`. `None` unless `state == WithdrawPending`.
    pub withdrawal_requested_at: Option<i64>,
    pub bump: u8,
}
