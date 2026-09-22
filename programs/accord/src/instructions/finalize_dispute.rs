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
        require!(final_ruling != u64::MAX, AccordError::InvalidState);

        let sub_key = ctx.accounts.subaccord.key();
        let dispute_key = dispute.key();
        let panel = round.juror_count as usize;
        let appeal_n = dispute.current_round as usize;
        let fee_per_juror = dispute.terms.fee_per_juror;
        let terms = dispute.terms; // Copy — splits the terms/fee_paid borrows below
        let bounty_pool = dispute.bounty_pool; // ADR-0030 — same borrow-split
        require!(
            ctx.remaining_accounts.len() == panel + appeal_n,
            AccordError::InvalidPanelSize
        );

        // --- Appeal bond settlement (ADR-0004 + ADR-0030) ---
        // `amount` is the total deposit (fee + bond). Derive the fee from the
        // round's panel size, forfeit only the bond portion on no-flip.
        // AppealBond layout: disc(8) + dispute(32) + round_idx(4) + appellant(32)
        // => amount @ 76 (u64), prior_result @ 84 (u64, ADR-0025),
        //    reward @ 92 (u64, ADR-0030).
        let mut forfeited_total: u64 = 0;
        let mut aligned = [false; MAX_APPEALS];
        // AppealBond field access (CU-opt — see `crate::layout`).
        const BOND_ROUND_IDX_OFFSET: usize = crate::layout::AB_ROUND_IDX_OFF;
        const BOND_AMOUNT_OFFSET: usize = crate::layout::AB_AMOUNT_OFF;
        const BOND_PRIOR_OFFSET: usize = crate::layout::AB_PRIOR_OFF;
        const BOND_REWARD_OFFSET: usize = crate::layout::AB_REWARD_OFF;
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
            let (bond_portion, prior_result, round_idx) = {
                let d = bond_info.try_borrow_data()?;
                require!(
                    d.len() >= BOND_REWARD_OFFSET + 8,
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
                (
                    total_deposit.saturating_sub(fee),
                    u64::from_le_bytes(
                        d[BOND_PRIOR_OFFSET..BOND_PRIOR_OFFSET + 8]
                            .try_into()
                            .unwrap(),
                    ),
                    round_idx,
                )
            };
            // The bond chain is the round-result history: bond i stores
            // `prior_result = R_i` (the result of round i, which it appealed)
            // and `round_idx = i + 1` (the round it opened). Pinning the
            // index here makes the aligned-flipper derivation below sound
            // without passing prior Round accounts (L6 account-budget check:
            // worst case stays panel + appeal_n, no growth).
            require!(
                round_idx == i as u32 + 1,
                AccordError::InvalidMembershipProof
            );
            if prior_result == final_ruling {
                // No flip: forfeit the bond portion into the coherent pool
                // (ADR-0004) and zero the deposit.
                forfeited_total = forfeited_total
                    .checked_add(bond_portion)
                    .ok_or(AccordError::ArithmeticOverflow)?;
                let mut d = bond_info.try_borrow_mut_data()?;
                d[BOND_AMOUNT_OFFSET..BOND_AMOUNT_OFFSET + 8].copy_from_slice(&0u64.to_le_bytes());
            } else {
                // ADR-0030 aligned flipper: the appeal attacked a result the
                // final ruling rejected (`prior_result ≠ final_ruling`) AND
                // its own round's verdict IS the final ruling. Round i+1's
                // result is `bond[i+1].prior_result` (the next appeal
                // recorded it when appealing round i+1) — or, for the last
                // appeal, the final round's result itself (= final_ruling).
                let next_result = if i + 1 < appeal_n {
                    let next_info = &ctx.remaining_accounts[panel + i + 1];
                    require!(
                        next_info.owner == &crate::ID,
                        AccordError::InvalidMembershipProof
                    );
                    let d = next_info.try_borrow_data()?;
                    require!(
                        d.len() >= BOND_PRIOR_OFFSET + 8,
                        AccordError::InvalidMembershipProof
                    );
                    u64::from_le_bytes(
                        d[BOND_PRIOR_OFFSET..BOND_PRIOR_OFFSET + 8]
                            .try_into()
                            .unwrap(),
                    )
                } else {
                    final_ruling
                };
                aligned[i] = prior_result != final_ruling && next_result == final_ruling;
            }
        }

        // --- Flip-bounty disposition (ADR-0030) ---
        // Appeals happened ⇒ the pool is disposed now (Final with no appeal
        // ever leaves it on the dispute for `claim_filing_bounty`). Equal
        // shares among aligned flippers; the integer-div remainder joins the
        // forfeited bonds in the final round's coherent pool. Zero aligned
        // bonds (no flip — defensive fallback; unreachable per ADR-0030's
        // non-emptiness argument) routes the whole pool to `pool_extra`.
        if appeal_n > 0 {
            let aligned_count = aligned.iter().filter(|a| **a).count() as u64;
            let reward_each = if aligned_count > 0 {
                bounty_pool / aligned_count
            } else {
                0
            };
            let remainder = bounty_pool
                .checked_sub(
                    reward_each
                        .checked_mul(aligned_count)
                        .ok_or(AccordError::ArithmeticOverflow)?,
                )
                .ok_or(AccordError::ArithmeticOverflow)?;
            forfeited_total = forfeited_total
                .checked_add(remainder)
                .ok_or(AccordError::ArithmeticOverflow)?;
            if reward_each > 0 {
                for i in 0..appeal_n {
                    if aligned[i] {
                        let bond_info = &ctx.remaining_accounts[panel + i];
                        let mut d = bond_info.try_borrow_mut_data()?;
                        d[BOND_REWARD_OFFSET..BOND_REWARD_OFFSET + 8]
                            .copy_from_slice(&reward_each.to_le_bytes());
                    }
                }
            }
            dispute.bounty_pool = 0;
        }

        // --- Settle the final round's jurors (coherence vs final_ruling) ---
        settle_round_accounts(
            &round,
            &terms,
            &sub_key,
            &ctx.remaining_accounts[..panel],
            final_ruling,
            forfeited_total,
            &mut dispute.fee_paid,
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
