//! `create_list` handler — see `CreateList` accounts struct in `lib.rs`.
//!
//! Inits the `CanonList` PDA `["canon", creator, rules_hash]` and CPIs Accord
//! `create_subaccord` for the 1:1 backing court with the Canon canonical
//! dispute-mechanism defaults. `risk_type := rules_hash`. The Subaccord creator
//! is the list creator (same `Signer`), so the seeds pair naturally:
//!   CanonList  `["canon",     creator, rules_hash]`
//!   Subaccord  `["subaccord", creator, rules_hash]`
//! and no PDA signing is needed — the creator's signer privilege propagates
//! through the CPI.

use crate::constants::*;
use crate::errors::CanonError;
use crate::CreateList;
use accord::state::{Aggregation, CreateSubaccordParams, ShortfallPolicy};
use anchor_lang::prelude::*;

/// Implementation for `create_list` — called from the `#[program]` dispatch in
/// `lib.rs`. Kept here so lib.rs stays thin.
#[allow(clippy::too_many_arguments)]
pub fn create_list_handler(
    ctx: Context<CreateList>,
    stake_mint: Pubkey,
    fee_mint: Pubkey,
    list_program: Pubkey,
    rules_hash: [u8; 32],
    submit_deposit: u64,
    challenge_pct: u16,
    listing_window: u64,
    withdrawal_timelock: u64,
) -> Result<()> {
    // --- Validation -------------------------------------------------------
    require!(rules_hash != [0u8; 32], CanonError::InvalidRulesHash);
    require!(
        challenge_pct <= MAX_CHALLENGE_PCT_BPS,
        CanonError::ChallengePctTooHigh
    );

    // --- CPI: create the backing Subaccord with Canon canonical defaults ---
    let cpi_accounts = accord::cpi::accounts::CreateSubaccord {
        creator: ctx.accounts.creator.to_account_info(),
        subaccord: ctx.accounts.subaccord.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.accord_program.key(), cpi_accounts);

    accord::cpi::create_subaccord(
        cpi_ctx,
        rules_hash, // risk_type
        [0u8; 32],  // evidence_spec — no canonical evidence spec yet (ADR-0006)
        CreateSubaccordParams {
            staking_token: stake_mint,
            fee_token: fee_mint,
            min_stake: DEFAULT_MIN_STAKE,
            alpha_bps: DEFAULT_ALPHA_BPS,
            review_window: DEFAULT_REVIEW_WINDOW_SECS,
            commit_window: DEFAULT_COMMIT_WINDOW_SECS,
            reveal_window: DEFAULT_REVEAL_WINDOW_SECS,
            appeal_window: DEFAULT_APPEAL_WINDOW_SECS,
            max_appeals: DEFAULT_MAX_APPEALS,
            aggregation: Aggregation::Plurality,
            fee_per_juror: DEFAULT_FEE_PER_JUROR,
            reveal_threshold_bps: DEFAULT_REVEAL_THRESHOLD_BPS,
            shortfall_policy: ShortfallPolicy::Redraw,
            max_draw_attempts: DEFAULT_MAX_DRAW_ATTEMPTS,
            // ponytail: Pubkey::default() => immutable Subaccord. The SPEC
            // intends a Canon governance multisig for retunable params, but
            // the multisig address is not deployed yet. Immutable is the safe
            // default — update when the multisig exists.
            authority: Pubkey::default(),
            evidence_operator: Pubkey::default(),
            depth: DEFAULT_TREE_DEPTH,
        },
    )?;

    // --- Init CanonList ---------------------------------------------------
    let list = &mut ctx.accounts.list;
    list.creator = ctx.accounts.creator.key();
    list.stake_mint = stake_mint;
    list.fee_mint = fee_mint;
    list.list_program = list_program;
    list.rules_hash = rules_hash;
    list.subaccord = ctx.accounts.subaccord.key();
    list.submit_deposit = submit_deposit;
    list.challenge_pct = challenge_pct;
    list.listing_window = listing_window;
    list.withdrawal_timelock = withdrawal_timelock;
    // ponytail: mirrors the Subaccord authority (immutable for now).
    list.authority = Pubkey::default();
    list.item_count = 0;
    list.bump = ctx.bumps.list;

    Ok(())
}
