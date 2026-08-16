use crate::{attestation::*, constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;

/// Account context for `prune_juror` (PROG-ATTESTTION). Permissionless — the
/// `caller` signs (any cranker); the expired `juror` does NOT sign. The
/// `JurorStake` PDA is seeded off the passed `juror`, so derivation links the
/// stake record to the juror identity used for the attestation subject check.
/// `remaining_accounts[0]` carries the expired SAS attestation (read-only
/// proof). No token accounts — prune is ledger-only (the SPL transfer happens
/// at the two-phase `withdraw`).
#[derive(Accounts)]
pub struct PruneJuror<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    /// CHECK: the expired juror — NOT a signer (prune is permissionless). Its
    /// address seeds the `JurorStake` PDA below, linking the two.
    pub juror: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_JUROR_STAKE, subaccord.key().as_ref(), juror.key().as_ref()],
        bump = juror_stake.bump,
    )]
    pub juror_stake: Account<'info, JurorStake>,
    pub system_program: Program<'info, System>,
    // remaining_accounts[0] = the expired SAS attestation (read-only proof).
}

impl<'info> PruneJuror<'info> {
    pub fn handler_prune_juror(ctx: Context<PruneJuror>, path: Vec<MSTNode>) -> Result<()> {
        let sub = &mut ctx.accounts.subaccord;
        // Only meaningful for gated pools (stake-only Subaccords have nothing
        // to expire).
        require!(
            sub.juror_credential != Pubkey::default(),
            AccordError::AttestationMissing
        );

        // Expiry proof: the juror's attestation must be actually expired.
        require!(
            !ctx.remaining_accounts.is_empty(),
            AccordError::AttestationMissing
        );
        let att = &ctx.remaining_accounts[0];
        let expiry = validate_sas_attestation(
            att,
            &sub.juror_credential,
            &sub.juror_schema,
            &ctx.accounts.juror.key(),
        )?;
        let now = Clock::get()?.unix_timestamp;
        require!(
            expiry != 0 && expiry <= now,
            AccordError::AttestationNotExpired
        );

        let juror_key = ctx.accounts.juror.key();
        let js = &mut ctx.accounts.juror_stake;
        // DRY with request_withdraw: the ledger must be canonical first.
        require!(js.stake_delta == 0, AccordError::PendingSettlement);
        // No double-exit while a withdrawal is already pending.
        require!(js.pending_withdrawal == 0, AccordError::WithdrawalPending);
        let amount = js.staked;
        require!(amount > 0, AccordError::InvalidAmount);

        // Free-stake discipline (mirrors request_withdraw): banking the full
        // stake requires no slash reserve outstanding (⇔ no in-flight draws).
        let free_stake = js.staked.saturating_sub(js.slash_reserve);
        require!(amount <= free_stake, AccordError::InsufficientBalance);

        let old_stake = js.staked;
        let index = js.tree_index;
        let (new_root, new_total) = verify_and_recompute(
            &juror_key,
            old_stake,
            &juror_key,
            0,
            index,
            &path,
            &sub.root_hash,
            sub.total_stake,
        )?;

        js.staked = 0;
        js.pending_withdrawal = js
            .pending_withdrawal
            .checked_add(amount)
            .ok_or(AccordError::ArithmeticOverflow)?;
        js.withdraw_requested_at = now;
        sub.staker_count = sub.staker_count.saturating_sub(1);
        sub.root_hash = new_root;
        sub.total_stake = new_total;

        emit!(Unstaked {
            subaccord: sub.key(),
            juror: juror_key,
            amount,
        });
        Ok(())
    }
}
