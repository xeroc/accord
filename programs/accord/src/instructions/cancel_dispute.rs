use crate::{constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Account context for `cancel_dispute` (CONCEPT-REVIEW Ugly 4) — the
/// permissionless liveness-escape crank. `filer_token_account` is constrained
/// to the dispute's filer (the refund destination); the vault is the Subaccord
/// PDA's ATA so the program PDA-signs the refund out. Post-draw cancels pass
/// the current `Round` + its drawn `JurorStake` PDAs as `remaining_accounts`.
#[derive(Accounts)]
pub struct CancelDispute<'info> {
    /// Any cranker; no authority check (the elapsed timeout is the gate).
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
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
    #[account(address = subaccord.fee_token)]
    pub fee_token: Account<'info, Mint>,
    /// Refund destination — must be the filer's ATA.
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = dispute.filer,
    )]
    pub filer_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = subaccord,
    )]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

impl<'info> CancelDispute<'info> {
    pub fn handler_cancel_dispute(ctx: Context<CancelDispute>) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        let now = Clock::get()?.unix_timestamp;
        let dispute_key = dispute.key();
        let filer = dispute.filer;
        let state = dispute.state;
        let current_round = dispute.current_round;
        let sub_key = ctx.accounts.subaccord.key();
        let slash_per_juror = (dispute.terms.alpha_bps as u64)
            .checked_mul(dispute.terms.min_stake)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(AccordError::ArithmeticOverflow)?;

        let post_draw = matches!(
            state,
            DisputeState::Drawn
                | DisputeState::Commit
                | DisputeState::Reveal
                | DisputeState::RoundResolved
        );

        if post_draw {
            // remaining_accounts = [current Round, ...JurorStake PDAs,
            //   ...prior Round PDAs + their JurorStake PDAs, ...AppealBond PDAs].
            require!(
                !ctx.remaining_accounts.is_empty(),
                AccordError::InvalidState
            );
            let round_info = &ctx.remaining_accounts[0];
            let expected_round = Pubkey::find_program_address(
                &[
                    SEED_ROUND,
                    dispute_key.as_ref(),
                    &current_round.to_le_bytes(),
                ],
                &crate::ID,
            )
            .0;
            require!(
                round_info.key == &expected_round,
                AccordError::InvalidMembershipProof
            );

            // Load the zero-copy Round to read its deadline + juror list.
            let (juror_count, jurors) = {
                let loader = AccountLoader::<Round>::try_from(round_info)?;
                let round = loader.load()?;
                let deadline = round
                    .reveal_end
                    .checked_add(dispute.terms.appeal_window as i64)
                    .and_then(|v| v.checked_add(POST_DRAW_CANCEL_GRACE_SECS))
                    .ok_or(AccordError::ArithmeticOverflow)?;
                require!(now > deadline, AccordError::CancelTooEarly);
                let count = round.juror_count as usize;
                (count, round.jurors[..count].to_vec())
            };

            // Release active_draws for every drawn juror in the current round.
            const ACTIVE_DRAWS_OFFSET: usize = crate::layout::JS_ACTIVE_DRAWS_OFF; // CU-opt — see crate::layout
            require!(
                juror_count < ctx.remaining_accounts.len(),
                AccordError::InvalidPanelSize
            );
            for (i, acct_info) in ctx.remaining_accounts[1..=juror_count].iter().enumerate() {
                let expected_pda = Pubkey::find_program_address(
                    &[SEED_JUROR_STAKE, sub_key.as_ref(), jurors[i].as_ref()],
                    &crate::ID,
                )
                .0;
                require!(
                    acct_info.key == &expected_pda,
                    AccordError::InvalidMembershipProof
                );
                require!(
                    acct_info.owner == &crate::ID,
                    AccordError::InvalidMembershipProof
                );
                let mut data = acct_info.try_borrow_mut_data()?;
                let draws = u32::from_le_bytes(
                    data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                        .try_into()
                        .unwrap(),
                );
                let new_draws = draws.saturating_sub(1);
                data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                    .copy_from_slice(&new_draws.to_le_bytes());
                // Release slash reserve for this dispute.
                const SLASH_RESERVE_OFF: usize = crate::layout::JS_SLASH_RESERVE_OFF;
                if data.len() >= SLASH_RESERVE_OFF + 8 {
                    let reserve = u64::from_le_bytes(
                        data[SLASH_RESERVE_OFF..SLASH_RESERVE_OFF + 8]
                            .try_into()
                            .unwrap(),
                    );
                    let new_reserve = reserve.saturating_sub(slash_per_juror);
                    data[SLASH_RESERVE_OFF..SLASH_RESERVE_OFF + 8]
                        .copy_from_slice(&new_reserve.to_le_bytes());
                }
            }

            // Release prior-round jurors.
            let rounds_end = release_prior_rounds(
                ctx.remaining_accounts,
                &dispute_key,
                &sub_key,
                1 + juror_count,
                current_round,
                slash_per_juror,
            )?;

            // Strict accounting: rounds + bonds must exactly fill remaining_accounts.
            let appeal_n = current_round as usize;
            require!(
                rounds_end + appeal_n == ctx.remaining_accounts.len(),
                AccordError::InvalidPanelSize
            );

            // C-1: validate appeal-bond PDAs (needed for later
            // claim_appeal_refund). Their total is NOT used for the filer refund
            // — the fee_vault is shared across all disputes; using its balance
            // would steal other disputes' deposits.
            read_bond_amounts(ctx.remaining_accounts, &dispute_key, rounds_end, appeal_n)?;
        } else {
            // Pre-draw stall (Created). Terminal states are rejected here.
            require!(state == DisputeState::Created, AccordError::InvalidState);
            let deadline = dispute
                .filed_at
                .checked_add(PRE_DRAW_CANCEL_TIMEOUT_SECS)
                .ok_or(AccordError::ArithmeticOverflow)?;
            require!(now > deadline, AccordError::CancelTooEarly);

            // REVIEW #3: probe for a partially-drawn current round. If any
            // seats landed before the stall, release those jurors too.
            let mut idx = 0;
            let current_round_pda = Pubkey::find_program_address(
                &[
                    SEED_ROUND,
                    dispute_key.as_ref(),
                    &current_round.to_le_bytes(),
                ],
                &crate::ID,
            )
            .0;
            if !ctx.remaining_accounts.is_empty()
                && ctx.remaining_accounts[0].key == &current_round_pda
            {
                const ACTIVE_DRAWS_OFFSET: usize = crate::layout::JS_ACTIVE_DRAWS_OFF;
                let (juror_count, jurors) = {
                    let loader = AccountLoader::<Round>::try_from(&ctx.remaining_accounts[0])?;
                    let round = loader.load()?;
                    let c = round.juror_count as usize;
                    (c, round.jurors[..c].to_vec())
                };
                require!(
                    juror_count < ctx.remaining_accounts.len(),
                    AccordError::InvalidPanelSize
                );
                for (j, juror) in jurors.iter().enumerate() {
                    let acct_info = &ctx.remaining_accounts[1 + j];
                    let expected_pda = Pubkey::find_program_address(
                        &[SEED_JUROR_STAKE, sub_key.as_ref(), juror.as_ref()],
                        &crate::ID,
                    )
                    .0;
                    require!(
                        acct_info.key == &expected_pda,
                        AccordError::InvalidMembershipProof
                    );
                    require!(
                        acct_info.owner == &crate::ID,
                        AccordError::InvalidMembershipProof
                    );
                    let mut data = acct_info.try_borrow_mut_data()?;
                    let draws = u32::from_le_bytes(
                        data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                            .try_into()
                            .unwrap(),
                    );
                    data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                        .copy_from_slice(&draws.saturating_sub(1).to_le_bytes());
                    // Release slash reserve for this dispute.
                    const SLASH_RESERVE_OFF: usize = crate::layout::JS_SLASH_RESERVE_OFF;
                    if data.len() >= SLASH_RESERVE_OFF + 8 {
                        let reserve = u64::from_le_bytes(
                            data[SLASH_RESERVE_OFF..SLASH_RESERVE_OFF + 8]
                                .try_into()
                                .unwrap(),
                        );
                        let new_reserve = reserve.saturating_sub(slash_per_juror);
                        data[SLASH_RESERVE_OFF..SLASH_RESERVE_OFF + 8]
                            .copy_from_slice(&new_reserve.to_le_bytes());
                    }
                }
                idx = 1 + juror_count;
            }

            // Release prior-round jurors (appeal rounds that completed but
            // were never settled).
            let rounds_end = release_prior_rounds(
                ctx.remaining_accounts,
                &dispute_key,
                &sub_key,
                idx,
                current_round,
                slash_per_juror,
            )?;

            // Strict accounting: rounds + bonds must exactly fill remaining_accounts.
            let appeal_n = current_round as usize;
            require!(
                rounds_end + appeal_n == ctx.remaining_accounts.len(),
                AccordError::InvalidPanelSize
            );

            // C-1: validate appeal-bond PDAs (same as post-draw branch).
            read_bond_amounts(ctx.remaining_accounts, &dispute_key, rounds_end, appeal_n)?;
        }

        // --- Refund: per-dispute fee_paid only (C-1). The fee_vault is one
        // shared ATA for the entire Subaccord; using vault_balance would drain
        // other disputes' deposits. Appeal bonds stay claimable via
        // claim_appeal_refund — not swept here. ---
        let filer_fee = dispute.fee_paid;
        dispute.fee_paid = 0;

        let sub = &mut ctx.accounts.subaccord;
        let bump = [sub.bump];
        let signer_seeds = &[
            SEED_SUBACCORD,
            sub.creator.as_ref(),
            sub.domain_ref.as_ref(),
            &bump,
        ];
        if filer_fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.fee_vault.to_account_info(),
                        to: ctx.accounts.filer_token_account.to_account_info(),
                        authority: sub.to_account_info(),
                    },
                    &[signer_seeds],
                ),
                filer_fee,
            )?;
        }

        // Parallel vault ledger (bean accord-fdad): track the filer refund out.
        if filer_fee > 0 {
            sub.fee_vault_withdrawn = sub
                .fee_vault_withdrawn
                .checked_add(filer_fee)
                .ok_or(AccordError::ArithmeticOverflow)?;
        }

        dispute.state = DisputeState::Failed;

        emit!(DisputeCancelled {
            dispute: dispute_key,
            filer,
            refund: filer_fee,
        });
        Ok(())
    }
}
