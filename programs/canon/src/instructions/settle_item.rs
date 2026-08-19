//! `settle_item` — SPEC §Instructions #5. Permissionless settlement crank.
//!
//! After the Accord dispute finalises, reads `final_ruling` and redistributes.
//! A terminal `Failed` dispute (cancel / redraw exhaustion) carries no ruling:
//! both parties are refunded their own stake and the item is `Removed`.

use crate::{constants::*, errors::CanonError, events::*, state::*};
use accord::state::{Dispute, DisputeState};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Every data account is boxed: with the payout destinations typed
/// (`Account<TokenAccount>`, C-1) the generated `try_accounts` frame exceeds
/// the 4096-byte BPF stack limit unless the whole context lives on the heap
/// (same convention as `ChallengeItem`).
#[derive(Accounts)]
pub struct SettleItem<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_CANON_LIST, list.creator.as_ref(), list.rules_hash.as_ref()],
        bump = list.bump,
    )]
    pub list: Box<Account<'info, CanonList>>,
    #[account(
        mut,
        seeds = [SEED_CANON_ITEM, list.key().as_ref(), item.account.as_ref()],
        bump = item.bump,
        constraint = item.list == list.key(),
    )]
    pub item: Box<Account<'info, CanonItem>>,
    /// Accord Dispute — `Account<Dispute>` validates ownership + deserialises;
    /// `state` + `final_ruling` are read directly.
    #[account(constraint = item.active_dispute == dispute.key() @ CanonError::DisputePdaMismatch)]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(address = list.fee_mint)]
    pub fee_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = fee_mint,
        associated_token::authority = list,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    /// Challenger's `fee_mint` token account — receives the bounty on `remove`
    /// and the stake refund on a `Failed` dispute. Pinned to the payee recorded
    /// on the item so a crank caller cannot redirect the payout (C-1).
    #[account(mut, token::mint = fee_mint, token::authority = item.challenger)]
    pub challenger_token_account: Box<Account<'info, TokenAccount>>,
    /// Submitter's `fee_mint` token account — receives the payout on
    /// withdrawal-`keep` and the refund on a `Failed` dispute. Pinned the same
    /// way (C-1).
    #[account(mut, token::mint = fee_mint, token::authority = item.submitter)]
    pub submitter_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<SettleItem>) -> Result<()> {
    let item = &mut ctx.accounts.item;
    require!(item.state == ItemState::Disputed, CanonError::NotDisputed);

    let list: &Account<'_, CanonList> = &ctx.accounts.list;
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_CANON_LIST,
        list.creator.as_ref(),
        list.rules_hash.as_ref(),
        &[list.bump],
    ]];

    // --- Failed dispute (terminal liveness escape: cancel_dispute or redraw
    // exhaustion). No ruling exists, so nobody won or lost — return each
    // side's own stake (no bounty, no forfeit) and delist the item. Without
    // this branch the challenger's stake would be locked forever: no other
    // instruction accepts a `Disputed` item.
    if ctx.accounts.dispute.state == DisputeState::Failed {
        let submitter_refund = item.accumulated_stake;
        let challenger_refund = item.challenge_stake;
        let item_key = item.key();
        let dispute_key = ctx.accounts.dispute.key();

        if submitter_refund > 0 {
            vault_pay(
                &ctx.accounts.token_program,
                &ctx.accounts.vault,
                list,
                &ctx.accounts.submitter_token_account,
                submitter_refund,
                signer_seeds,
            )?;
        }
        if challenger_refund > 0 {
            vault_pay(
                &ctx.accounts.token_program,
                &ctx.accounts.vault,
                list,
                &ctx.accounts.challenger_token_account,
                challenger_refund,
                signer_seeds,
            )?;
        }

        item.state = ItemState::Removed;
        item.accumulated_stake = 0;
        item.active_dispute = Pubkey::default();
        item.challenger = Pubkey::default();
        item.challenge_stake = 0;

        emit!(ItemSettlementVoided {
            list: list.key(),
            item: item_key,
            dispute: dispute_key,
            submitter_refund,
            challenger_refund,
        });
        return Ok(());
    }

    // --- Final dispute: read the ruling and redistribute. ---
    // `Dispute::ruling()` is Accord's single source for the Final +
    // u64::MAX-sentinel contract; ownership + address are validated by
    // `Account<Dispute>` + the struct constraint. Canon only ever files
    // Plurality disputes, so the ruling is an option index.
    let ruling = ctx
        .accounts
        .dispute
        .ruling()
        .ok_or(CanonError::DisputeNotFinal)?;
    // Canon filed exactly two options (0 = keep, 1 = remove).
    require!(ruling < 2, CanonError::InvalidRuling);

    let is_withdrawal = item.withdrawal_requested_at.is_some();
    let challenge_stake = item.challenge_stake;
    let accumulated = item.accumulated_stake;
    let keep = ruling == 0;

    if keep && !is_withdrawal {
        // Regular keep: progressive protection. No transfer.
        item.accumulated_stake = accumulated
            .checked_add(challenge_stake)
            .ok_or(CanonError::ArithmeticOverflow)?;
        item.state = ItemState::Listed;
    } else {
        let total = accumulated
            .checked_add(challenge_stake)
            .ok_or(CanonError::ArithmeticOverflow)?;

        let dest: &Account<'_, TokenAccount> = if keep {
            // Withdrawal-keep → submitter.
            &ctx.accounts.submitter_token_account
        } else {
            // Remove → challenger.
            &ctx.accounts.challenger_token_account
        };
        vault_pay(
            &ctx.accounts.token_program,
            &ctx.accounts.vault,
            list,
            dest,
            total,
            signer_seeds,
        )?;

        item.state = ItemState::Removed;
        item.accumulated_stake = 0;
    }

    item.active_dispute = Pubkey::default();
    item.challenger = Pubkey::default();
    item.challenge_stake = 0;

    emit!(ItemSettled {
        list: list.key(),
        item: item.key(),
        ruling,
        is_withdrawal,
        challenge_stake,
        accumulated_before_settlement: accumulated,
    });

    Ok(())
}

/// Vault → `dest` payout signed by the CanonList PDA. Shared by the Final
/// redistribute and the Failed-refund paths — one CPI call site keeps the
/// stack frame small.
fn vault_pay<'info>(
    token_program: &Program<'info, Token>,
    vault: &Account<'info, TokenAccount>,
    list: &Account<'info, CanonList>,
    dest: &Account<'info, TokenAccount>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    token::transfer(
        CpiContext::new_with_signer(
            token_program.key(),
            Transfer {
                from: vault.to_account_info(),
                to: dest.to_account_info(),
                authority: list.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )
}
