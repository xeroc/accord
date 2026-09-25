use crate::{constants::*, errors::AccordError, state::*, utils::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Account context for `claim_appeal_refund` — permissionless crank returning a
/// flipped appeal bond. `round_idx` (instruction arg) selects the bond PDA
/// `["bond", dispute, round_idx]`. The refund sweep is PDA-signed out of the
/// vault into the claimant's ATA; the handler verifies the ATA belongs to the
/// bond's recorded appellant. Named accounts only (no `remaining_accounts`)
/// keeps the CPI lifetime-uniform.
#[derive(Accounts)]
#[instruction(round_idx: u32)]
pub struct ClaimAppealRefund<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.domain_ref.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    /// The specific appeal bond being claimed.
    #[account(
        mut,
        seeds = [SEED_APPEAL_BOND, dispute.key().as_ref(), &round_idx.to_le_bytes()],
        bump = appeal_bond.bump,
    )]
    pub appeal_bond: Box<Account<'info, AppealBond>>,
    #[account(address = subaccord.fee_token)]
    pub fee_token: Account<'info, Mint>,
    /// The appellant's ATA — sweep destination. Any caller may pass it; the
    /// handler rejects it unless its owner matches the bond's recorded appellant.
    #[account(mut, token::mint = fee_token)]
    pub claimant_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = subaccord,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

impl<'info> ClaimAppealRefund<'info> {
    pub fn handler_claim_appeal_refund(
        ctx: Context<ClaimAppealRefund>,
        round_idx: u32,
    ) -> Result<()> {
        let _ = round_idx; // consumed by the `#[instruction]` PDA seeds
        let dispute = &ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Final || dispute.state == DisputeState::Failed,
            AccordError::InvalidState
        );

        let bond_acc = &ctx.accounts.appeal_bond;
        require!(
            bond_acc.appellant == ctx.accounts.claimant_token_account.owner,
            AccordError::InvalidMembershipProof
        );

        // `amount` is the total deposit (appeal fee + bond). On **Final** the
        // appellant always recovers ONLY the bond — never the appeal fee
        // (bean accord-xftx): the fee settled at finality with the round's
        // coherent jurors, and a no-flip bond was already zeroed by
        // finalize_dispute (yielding 0 → InvalidAmount, the idempotent guard
        // against claiming a forfeited bond). On **Failed** (ADR-0033: no
        // ruling, no pay) the round's jurors earn nothing, so the appeal fee
        // has no destination — the whole deposit returns to the appellant.
        // ADR-0030: any flip-bounty share credited to `reward` (aligned
        // flipper at Final, or the appellant's own +1 unit on the Failed
        // path) rides this same claim.
        let refund = if dispute.state == DisputeState::Failed {
            bond_acc
                .amount
                .checked_add(bond_acc.reward)
                .ok_or(AccordError::ArithmeticOverflow)?
        } else {
            let fee = (panel_size_for_round(bond_acc.round_idx, dispute.terms.min_jury_size)?
                as u64)
                .checked_mul(dispute.terms.fee_per_juror)
                .ok_or(AccordError::ArithmeticOverflow)?;
            bond_acc
                .amount
                .saturating_sub(fee)
                .checked_add(bond_acc.reward)
                .ok_or(AccordError::ArithmeticOverflow)?
        };
        require!(refund > 0, AccordError::InvalidAmount);

        let sub = &mut ctx.accounts.subaccord;
        let bump = [sub.bump];
        let signer_seeds = &[
            SEED_SUBACCORD,
            sub.creator.as_ref(),
            sub.domain_ref.as_ref(),
            &bump,
        ];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.claimant_token_account.to_account_info(),
                    authority: sub.to_account_info(),
                },
                &[signer_seeds],
            ),
            refund,
        )?;

        // Parallel vault ledger (bean accord-fdad): track the bond refund out.
        sub.fee_vault_withdrawn = sub
            .fee_vault_withdrawn
            .checked_add(refund)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Mark claimed (idempotent): no double-refund on re-invocation.
        // `reward` zeroes with the deposit — the bounty share claims exactly
        // once, same pattern as the bond (ADR-0030).
        ctx.accounts.appeal_bond.amount = 0;
        ctx.accounts.appeal_bond.reward = 0;
        Ok(())
    }
}
