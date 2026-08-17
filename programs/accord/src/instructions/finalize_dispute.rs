use crate::{constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;

/// Account context for `finalize_dispute` — permissionless crank. Drawn
/// `JurorStake` accounts are passed as `remaining_accounts` (mut), verified
/// against the round's juror list + PDA derivation inside the handler. Appeal
/// bonds are settled ledger-style here: forfeited (no-flip) bonds fold into the
/// coherent pool; flipped bonds are returned by the separate
/// `claim_appeal_refund` crank.
#[derive(Accounts)]
pub struct FinalizeDispute<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.domain_ref.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
}

impl<'info> FinalizeDispute<'info> {
    pub fn handler_finalize_dispute(ctx: Context<FinalizeDispute>) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::RoundResolved,
            AccordError::InvalidState
        );

        let mut round = ctx.accounts.round.load_mut()?;
        require!(round.settled == 0, AccordError::RoundAlreadySettled);

        let now = Clock::get()?.unix_timestamp;
        let appeal_deadline = round
            .reveal_end
            .checked_add(dispute.terms.appeal_window as i64)
            .ok_or(AccordError::ArithmeticOverflow)?;
        require!(now >= appeal_deadline, AccordError::AppealWindowOpen);

        let final_ruling = round.result;
        require!(final_ruling != u8::MAX, AccordError::InvalidState);

        let sub_key = ctx.accounts.subaccord.key();
        let dispute_key = dispute.key();
        let panel = round.juror_count as usize;
        let appeal_n = dispute.current_round as usize;
        let fee_per_juror = dispute.terms.fee_per_juror;
        require!(
            ctx.remaining_accounts.len() == panel + appeal_n,
            AccordError::InvalidPanelSize
        );

        // --- Appeal bond forfeiture (ADR-0004) ---
        // `amount` is the total deposit (fee + bond). Derive the fee from the
        // round's panel size, forfeit only the bond portion on no-flip.
        // AppealBond layout: disc(8) + dispute(32) + round_idx(4) + appellant(32)
        // => amount @ 76 (u64), prior_result @ 84 (u8).
        let mut forfeited_total: u64 = 0;
        // AppealBond field access (CU-opt — see `crate::layout`).
        const BOND_ROUND_IDX_OFFSET: usize = crate::layout::AB_ROUND_IDX_OFF;
        const BOND_AMOUNT_OFFSET: usize = crate::layout::AB_AMOUNT_OFF;
        const BOND_PRIOR_OFFSET: usize = crate::layout::AB_PRIOR_OFF;
        for i in 0..appeal_n {
            let expected_pda = Pubkey::find_program_address(
                &[
                    SEED_APPEAL_BOND,
                    dispute_key.as_ref(),
                    &(i as u32).to_le_bytes(),
                ],
                &crate::ID,
            )
            .0;
            let bond_info = &ctx.remaining_accounts[panel + i];
            require!(
                bond_info.key == &expected_pda,
                AccordError::InvalidMembershipProof
            );
            require!(
                bond_info.owner == &crate::ID,
                AccordError::InvalidMembershipProof
            );
            let (bond_portion, prior_result) = {
                let d = bond_info.try_borrow_data()?;
                require!(
                    d.len() > BOND_PRIOR_OFFSET,
                    AccordError::InvalidMembershipProof
                );
                let total_deposit = u64::from_le_bytes(
                    d[BOND_AMOUNT_OFFSET..BOND_AMOUNT_OFFSET + 8]
                        .try_into()
                        .unwrap(),
                );
                let round_idx = u32::from_le_bytes(
                    d[BOND_ROUND_IDX_OFFSET..BOND_ROUND_IDX_OFFSET + 4]
                        .try_into()
                        .unwrap(),
                );
                let fee = (panel_size_for_round(round_idx, dispute.terms.min_jury_size)? as u64)
                    .checked_mul(fee_per_juror)
                    .ok_or(AccordError::ArithmeticOverflow)?;
                (total_deposit.saturating_sub(fee), d[BOND_PRIOR_OFFSET])
            };
            if prior_result == final_ruling {
                forfeited_total = forfeited_total
                    .checked_add(bond_portion)
                    .ok_or(AccordError::ArithmeticOverflow)?;
                let mut d = bond_info.try_borrow_mut_data()?;
                d[BOND_AMOUNT_OFFSET..BOND_AMOUNT_OFFSET + 8].copy_from_slice(&0u64.to_le_bytes());
            }
        }

        // --- Settle the final round's jurors (coherence vs final_ruling) ---
        settle_round_accounts(
            &round,
            &dispute.terms,
            &sub_key,
            &ctx.remaining_accounts[..panel],
            final_ruling,
            forfeited_total,
        )?;

        round.settled = 1;

        dispute.final_ruling = final_ruling;
        dispute.finalized_at = now;
        dispute.state = DisputeState::Final;

        emit!(RulingFinalized {
            dispute: dispute_key,
            ruling: final_ruling,
        });
        Ok(())
    }
}
