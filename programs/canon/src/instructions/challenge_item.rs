//! `challenge_item` — SPEC §Instructions #4. Permissionless challenge.
//!
//! Locks `challenge_stake = challenge_pct × accumulated_stake` **+**
//! `accord_fee` (both in `fee_mint`) from the challenger into the CanonList
//! vault, flips the item to `Disputed`, and CPIs Accord `create_dispute` as
//! the single filer (ADR-0004). Canon is the filer — the CanonList PDA signs
//! the CPI — and the dispute PDA is `["dispute", list, nonce]` where `nonce`
//! is the item's `challenge_count` (unique per challenge).
//!
//! Usable from `Pending`, `Listed`, or `WithdrawPending`.
//!
//! The four Accord CPI-only accounts are passed via `remaining_accounts`.
//! The Accord CPI uses raw `invoke_signed` (not the Anchor CPI client) to
//! keep the canon BPF binary lean.

use crate::{constants::*, errors::CanonError, events::*, state::*};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Accord program ID (single source of truth: `declare_id!` in
/// programs/accord/src/lib.rs).
pub const ACCORD_ID: Pubkey = pubkey!("cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed");

/// Anchor instruction discriminator for `global:create_dispute`
/// (`sha256("global:create_dispute")[..8]`), precomputed to avoid pulling
/// `solana-program` as a direct dependency.
const CREATE_DISPUTE_DISC: [u8; 8] = [0xa1, 0x63, 0x35, 0x74, 0x3c, 0x4f, 0x95, 0x69];

/// Account context for `challenge_item`. The four Accord CPI-only accounts
/// (`accord_dispute`, `accord_pause_state`, `accord_fee_vault`,
/// `accord_program`) are in `remaining_accounts`.
#[derive(Accounts)]
pub struct ChallengeItem<'info> {
    #[account(mut)]
    pub challenger: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_CANON_LIST, list.creator.as_ref(), list.rules_hash.as_ref()],
        bump = list.bump,
    )]
    pub list: Account<'info, CanonList>,
    #[account(
        mut,
        seeds = [SEED_CANON_ITEM, list.key().as_ref(), item.account.as_ref()],
        bump = item.bump,
        constraint = item.list == list.key(),
    )]
    pub item: Account<'info, CanonItem>,
    /// Backing Accord Subaccord. `fee_per_juror` read from raw bytes (Borsh
    /// offset 148). Forwarded to Accord's `create_dispute` CPI.
    /// CHECK: address verified in handler; Accord re-validates.
    pub subaccord: UncheckedAccount<'info>,
    #[account(address = list.fee_mint)]
    pub fee_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = fee_mint,
        associated_token::authority = challenger,
    )]
    pub challenger_token_account: Account<'info, TokenAccount>,
    /// CanonList-PDA-owned vault. Also the `filer_token_account` in the Accord
    /// CPI (Accord moves `accord_fee` from here into its Subaccord fee_vault).
    #[account(
        mut,
        associated_token::mint = fee_mint,
        associated_token::authority = list,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    // remaining_accounts[0..3]:
    //   [0] accord_dispute     (mut — Accord inits)
    //   [1] accord_pause_state (readonly — Accord validates)
    //   [2] accord_fee_vault   (mut — Accord init_if_needed + transfer)
    //   [3] accord_program     (readonly — address checked in handler)
}

/// Permissionless challenge. Locks stake + fee, flips to Disputed, CPIs Accord.
pub fn handler<'a>(ctx: Context<'a, ChallengeItem<'a>>, evidence: [u8; 32]) -> Result<()> {
    let rem = &ctx.remaining_accounts;
    require!(rem.len() >= 4, CanonError::MissingRemainingAccounts);
    let accord_dispute = &rem[0];
    let accord_pause_state = &rem[1];
    let accord_fee_vault = &rem[2];
    let accord_program = &rem[3];
    require!(
        accord_program.key() == ACCORD_ID,
        CanonError::WrongAccordProgram
    );

    let item = &mut ctx.accounts.item;

    // State gate: revert if already Disputed; must be Pending/Listed/WithdrawPending.
    require!(
        item.state != ItemState::Disputed,
        CanonError::AlreadyDisputed
    );
    require!(
        matches!(
            item.state,
            ItemState::Pending | ItemState::Listed | ItemState::WithdrawPending
        ),
        CanonError::InvalidItemState
    );

    let list = &ctx.accounts.list;

    // challenge_stake = challenge_pct * accumulated_stake / 10_000.
    let challenge_stake = (list.challenge_pct as u64)
        .checked_mul(item.accumulated_stake)
        .ok_or(CanonError::ArithmeticOverflow)?
        / 10_000;

    // Read fee_per_juror from the Subaccord's raw Borsh data (offset 148 =
    // 8 disc + 32+32+32+8+2+8+8+8+8+1+1).
    let sub_data = ctx.accounts.subaccord.try_borrow_data()?;
    let fee_per_juror = u64::from_le_bytes(sub_data[148..156].try_into().unwrap_or([0u8; 8]));
    let accord_fee = (INITIAL_NUM_JURORS as u64)
        .checked_mul(fee_per_juror)
        .ok_or(CanonError::ArithmeticOverflow)?;

    let total = challenge_stake
        .checked_add(accord_fee)
        .ok_or(CanonError::ArithmeticOverflow)?;

    require!(
        ctx.accounts.challenger_token_account.amount >= total,
        CanonError::InsufficientFunds
    );

    // Lock challenge_stake + accord_fee: challenger ATA -> CanonList vault.
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.challenger_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.challenger.to_account_info(),
            },
        ),
        total,
    )?;

    // Verify the dispute PDA derivation before the CPI.
    let nonce = item.challenge_count as u64;
    let (expected_dispute, _) = Pubkey::find_program_address(
        &[b"dispute", list.key().as_ref(), &nonce.to_le_bytes()],
        &ACCORD_ID,
    );
    require!(
        accord_dispute.key() == expected_dispute,
        CanonError::DisputePdaMismatch
    );

    // Record challenge bookkeeping on the item.
    item.state = ItemState::Disputed;
    item.active_dispute = accord_dispute.key();
    item.challenger = ctx.accounts.challenger.key();
    item.challenge_stake = challenge_stake;
    item.challenged_at = Clock::get()?.unix_timestamp;
    item.challenge_count = item
        .challenge_count
        .checked_add(1)
        .ok_or(CanonError::ArithmeticOverflow)?;

    // CPI Accord create_dispute via raw invoke_signed (Canon = single filer,
    // ADR-0004). The CanonList PDA signs; Accord moves accord_fee from
    // vault → fee_vault and inits the Dispute PDA.
    let mut cpi_data = Vec::with_capacity(76);
    cpi_data.extend_from_slice(&CREATE_DISPUTE_DISC);
    cpi_data.extend_from_slice(&2u32.to_le_bytes()); // options.len()
    cpi_data.extend_from_slice(&OPTION_KEEP);
    cpi_data.extend_from_slice(&OPTION_REMOVE);
    cpi_data.extend_from_slice(&evidence);
    cpi_data.extend_from_slice(&nonce.to_le_bytes());
    cpi_data.extend_from_slice(&accord_fee.to_le_bytes());

    let signer_bump = list.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_CANON_LIST,
        list.creator.as_ref(),
        list.rules_hash.as_ref(),
        &[signer_bump],
    ]];

    let cpi_ix = Instruction {
        program_id: ACCORD_ID,
        data: cpi_data,
        accounts: vec![
            AccountMeta::new(ctx.accounts.list.key(), true),
            AccountMeta::new_readonly(ctx.accounts.subaccord.key(), false),
            AccountMeta::new_readonly(accord_pause_state.key(), false),
            AccountMeta::new(accord_dispute.key(), false),
            AccountMeta::new_readonly(ctx.accounts.fee_mint.key(), false),
            AccountMeta::new(ctx.accounts.vault.key(), false),
            AccountMeta::new(accord_fee_vault.key(), false),
            AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.associated_token_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        ],
    };

    invoke_signed(
        &cpi_ix,
        &[
            ctx.accounts.list.to_account_info(),
            ctx.accounts.subaccord.to_account_info(),
            accord_pause_state.to_account_info(),
            accord_dispute.to_account_info(),
            ctx.accounts.fee_mint.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            accord_fee_vault.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.associated_token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            accord_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    emit!(ItemChallenged {
        list: list.key(),
        item: item.key(),
        challenger: ctx.accounts.challenger.key(),
        dispute: accord_dispute.key(),
        challenge_stake,
        accord_fee,
        evidence,
    });

    Ok(())
}
