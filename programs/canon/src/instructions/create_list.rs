//! `create_list` handler — see `CreateList` accounts struct in `lib.rs`.
//!
//! Inits the `CanonList` PDA `["canon", creator, rules_hash]` and CPIs Accord
//! `create_subaccord` for the 1:1 backing court with the creator-supplied
//! `CourtParams` profile (milestone accord-qz7d). `domain_ref := rules_hash`.
//! The Subaccord creator is the list creator (same `Signer`), so the seeds
//! pair naturally:
//!   CanonList  `["canon",     creator, rules_hash]`
//!   Subaccord  `["subaccord", creator, rules_hash]`
//! and no PDA signing is needed — the creator's signer privilege propagates
//! through the CPI.

use crate::constants::*;
use crate::errors::CanonError;
use crate::{CourtParams, CreateList};
use accord::state::{Aggregation, CreateSubaccordParams, ShortfallPolicy};
use anchor_lang::prelude::*;

/// Implementation for `create_list` — called from the `#[program]` dispatch in
/// `lib.rs`. Kept here so lib.rs stays thin.
#[allow(clippy::too_many_arguments)]
pub fn create_list_handler(
    ctx: Context<CreateList>,
    list_program: Pubkey,
    rules_hash: [u8; 32],
    submit_deposit: u64,
    challenge_pct: u16,
    listing_window: u64,
    withdrawal_timelock: u64,
    evidence_operator: Pubkey,
    court: CourtParams,
) -> Result<()> {
    // --- Validation -------------------------------------------------------
    require!(rules_hash != [0u8; 32], CanonError::InvalidRulesHash);
    // A zero operator can never be an ECIES target — the claimant SDK refuses
    // the X25519 conversion, so challenges against such a list dead-end at
    // evidence publish. Force a real operator at creation (deployment-supplied;
    // the dApp passes VITE_EVIDENCE_OPERATOR_ADDRESS).
    require!(
        evidence_operator != Pubkey::default(),
        CanonError::InvalidEvidenceOperator
    );
    require!(
        challenge_pct <= MAX_CHALLENGE_PCT_BPS,
        CanonError::ChallengePctTooHigh
    );
    // --- Court guards: ONLY what Accord does not already enforce at the CPI
    // boundary. Everything else (appeals cap, jury parity, ladder fit,
    // thresholds, draw attempts, appeal-window floor, depth <= 31) is
    // validated by `create_subaccord` and its errors propagate.
    // Accord's create_subaccord has no alpha check of its own (separate bug
    // bean filed) — 10_000 bps is the only sane ceiling (100% slash).
    require!(court.alpha_bps <= 10_000, CanonError::AlphaTooHigh);
    // A zero review/commit/reveal window bricks disputes forever — the round
    // can never advance, stranding third-party item deposits (not just creator
    // self-harm). Appeal floor is already enforced by Accord (1h).
    require!(
        court.review_window > 0 && court.commit_window > 0 && court.reveal_window > 0,
        CanonError::WindowTooShort
    );
    // Tighter than Accord's depth <= 31: the MST path (~40 B/level) rides in
    // every stake/draw tx; past 8 the draw tx blows the 1232-byte packet
    // budget (see MAX_LIST_TREE_DEPTH).
    require!(
        court.depth <= MAX_LIST_TREE_DEPTH,
        CanonError::TreeDepthTooDeep
    );

    // --- CPI: create the backing Subaccord from the creator's court profile ---
    // The court's authority is the CanonList PDA itself: no external key exists
    // yet, and `Pubkey::default()` would burn the retuning upgrade path forever
    // (immutable even after a canon upgrade). With the PDA as authority, a
    // future gated canon instruction can CPI `propose_subaccord_update` with
    // the list PDA as `invoke_signed` signer (same PDA-signing pattern as the
    // vault transfers in settle_item / advance_withdrawal). Until that
    // instruction ships, the PDA signs nothing — as immutable as `default()`,
    // but upgradeable.
    let list_pda = ctx.accounts.list.key();
    let cpi_accounts = accord::cpi::accounts::CreateSubaccord {
        creator: ctx.accounts.creator.to_account_info(),
        subaccord: ctx.accounts.subaccord.to_account_info(),
        staking_token: ctx.accounts.stake_mint.to_account_info(),
        fee_token: ctx.accounts.fee_mint.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.accord_program.key(), cpi_accounts);

    accord::cpi::create_subaccord(
        cpi_ctx,
        rules_hash, // domain_ref
        [0u8; 32],  // evidence_spec — no canonical evidence spec yet (ADR-0006)
        CreateSubaccordParams {
            min_stake: court.min_stake,
            alpha_bps: court.alpha_bps,
            review_window: court.review_window,
            commit_window: court.commit_window,
            reveal_window: court.reveal_window,
            appeal_window: court.appeal_window,
            max_appeals: court.max_appeals,
            min_jury_size: court.min_jury_size,
            aggregation: Aggregation::Plurality,
            fee_per_juror: court.fee_per_juror,
            reveal_threshold_bps: court.reveal_threshold_bps,
            shortfall_policy: ShortfallPolicy::Redraw,
            max_draw_attempts: court.max_draw_attempts,
            // Plurality pool — tolerance is inert; zero keeps it exact.
            coherence_tol_bps: 0,
            // The CanonList PDA — see the CPI comment above.
            authority: list_pda,
            evidence_operator,
            depth: court.depth,
            // PROG-ATTESTTION: stake-only backing court (no credential gate).
            // Canon lists do not gate jurors by attestation in v1.
            juror_credential: Pubkey::default(),
            juror_schema: Pubkey::default(),
        },
    )?;

    // --- Init CanonList ---------------------------------------------------
    let list = &mut ctx.accounts.list;
    list.creator = ctx.accounts.creator.key();
    list.stake_mint = ctx.accounts.stake_mint.key();
    list.fee_mint = ctx.accounts.fee_mint.key();
    list.list_program = list_program;
    list.rules_hash = rules_hash;
    list.subaccord = ctx.accounts.subaccord.key();
    list.submit_deposit = submit_deposit;
    list.challenge_pct = challenge_pct;
    list.listing_window = listing_window;
    list.withdrawal_timelock = withdrawal_timelock;
    // Mirrors the backing Subaccord's authority (the PDA itself).
    list.authority = list_pda;
    list.item_count = 0;
    list.dispute_count = 0;
    list.bump = ctx.bumps.list;

    Ok(())
}
