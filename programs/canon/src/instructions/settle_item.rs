//! `settle_item` — SPEC §Instructions #5. Permissionless settlement crank.
//!
//! After the Accord dispute finalises, reads `final_ruling` and redistributes.

use crate::{constants::*, errors::CanonError, events::*, state::*};
use accord::state::{Dispute, DisputeState};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct SettleItem<'info> {
    pub caller: Signer<'info>,
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
    /// Accord Dispute — `Account<Dispute>` validates ownership + deserialises;
    /// `state` + `final_ruling` are read directly. Boxed to keep the struct
    /// off the stack during the token-transfer CPI call chain.
    #[account(constraint = item.active_dispute == dispute.key() @ CanonError::DisputePdaMismatch)]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(address = list.fee_mint)]
    pub fee_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = fee_mint,
        associated_token::authority = list,
    )]
    pub vault: Account<'info, TokenAccount>,
    /// Challenger ATA — receives bounty on `remove`.
    /// CHECK: verified in handler via key check.
    #[account(mut)]
    pub challenger_token_account: UncheckedAccount<'info>,
    /// Submitter ATA — receives stake on withdrawal-`keep`.
    /// CHECK: verified in handler via key check.
    #[account(mut)]
    pub submitter_token_account: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<SettleItem>) -> Result<()> {
    let item = &mut ctx.accounts.item;
    require!(item.state == ItemState::Disputed, CanonError::NotDisputed);
    // `state == Final` gates settlement; `final_ruling` is the winning option
    // index (Canon: 0 = keep, 1 = remove). Ownership + address are validated
    // by `Account<Dispute>` + the struct constraint.
    require!(
        ctx.accounts.dispute.state == DisputeState::Final,
        CanonError::DisputeNotFinal
    );
    let ruling = ctx.accounts.dispute.final_ruling;
    require!(ruling < 2, CanonError::InvalidRuling);

    let is_withdrawal = item.withdrawal_requested_at.is_some();
    let challenge_stake = item.challenge_stake;
    let accumulated = item.accumulated_stake;
    let keep = ruling == 0;

    let list = &ctx.accounts.list;
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_CANON_LIST,
        list.creator.as_ref(),
        list.rules_hash.as_ref(),
        &[list.bump],
    ]];

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

        let dest = if keep {
            // Withdrawal-keep → submitter.
            &ctx.accounts.submitter_token_account
        } else {
            // Remove → challenger.
            &ctx.accounts.challenger_token_account
        };

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: dest.to_account_info(),
                    authority: ctx.accounts.list.to_account_info(),
                },
                signer_seeds,
            ),
            total,
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
