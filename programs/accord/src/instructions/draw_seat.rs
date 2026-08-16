use crate::{attestation::*, constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;

/// Account context for `draw_seat` (ADR-0012). Permissionless: any caller
/// submits one seat's membership proof. The round is `init_if_needed`
/// (zero-copy) so it persists across the N seat transactions; the drawn
/// juror's `JurorStake` is `remaining_accounts[0]` (the only per-seat account
/// beyond dispute + round, keeping the tx well under the 1232-byte limit).
#[derive(Accounts)]
pub struct DrawSeat<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    /// PROG-ATTESTTION: the backing Subaccord. Always passed; the credential
    /// re-check activates only when `juror_credential != default`.
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
        constraint = dispute.subaccord == subaccord.key() @ AccordError::SubaccordMismatch,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        init_if_needed,
        payer = caller,
        space = 8 + std::mem::size_of::<Round>(),
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
    pub system_program: Program<'info, System>,
}

impl<'info> DrawSeat<'info> {
    pub fn handler_draw_seat(
        ctx: Context<DrawSeat>,
        seat: u32,
        retries: u32,
        membership: JurorMembership,
    ) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Created,
            AccordError::InvalidState
        );
        let committed_vrf = dispute.committed_vrf.ok_or(AccordError::VrfNotCommitted)?;
        require!(dispute.frozen_total_stake > 0, AccordError::VrfNotCommitted);

        let round_idx = dispute.current_round;
        let panel = panel_size_for_round(round_idx, dispute.terms.min_jury_size)?;
        require!(seat < panel, AccordError::InvalidPanelSize);

        let leaf = &membership.leaf;
        require!(
            leaf.juror != Pubkey::default(),
            AccordError::InvalidMembershipProof
        );
        require!(
            leaf.stake >= dispute.terms.min_stake,
            AccordError::InsufficientStake
        );

        // Verify membership + reconstruct the cumulative-from-left prefix.
        let prefix = verify_membership_and_prefix(
            leaf,
            membership.index,
            &membership.proof,
            &dispute.frozen_root,
            dispute.frozen_total_stake,
        )?;

        // Load the round (init_if_needed — persists across the N seat txs).
        // Loaded BEFORE sortition: the collision check reads prior seats' ranges.
        let dispute_key = dispute.key();
        {
            let info = ctx.accounts.round.to_account_info();
            let mut data = info.try_borrow_mut_data()?;
            if data[..8].iter().all(|&b| b == 0) {
                data[..8].copy_from_slice(Round::DISCRIMINATOR);
            }
        }
        let mut round = ctx.accounts.round.load_mut()?;
        if round.dispute == Pubkey::default() {
            round.dispute = dispute_key;
            round.round_idx = round_idx;
            round.bump = ctx.bumps.round;
            round.juror_count = 0;
            round.commit_count = 0;
            round.reveal_count = 0;
            round.result = u8::MAX;
            round.commits = [[0u8; 32]; MAX_JURORS];
            round.reveals = [u8::MAX; MAX_JURORS];
        }
        require!(
            round.dispute == dispute_key && round.round_idx == round_idx,
            AccordError::InvalidState
        );

        // Seat must be the next sequential unfilled slot (REVIEW #6).
        require!(seat == round.juror_count, AccordError::InvalidPanelSize);

        // --- Deterministic sortition with on-chain collision re-roll (tzo0) ---
        //
        // r_i(retry) = u64_le(sha256(vrf_seed ‖ seat ‖ retry)[0..8]) % total
        // For retry < retries: r_i MUST land inside an already-drawn seat's range
        //   (a genuine collision — the cranker cannot skip a non-colliding retry
        //   to cherry-pick a preferred juror at a later retry).
        // For retry == retries: r_i MUST select the submitted leaf.
        require!(
            retries <= MAX_SORTITION_RETRIES,
            AccordError::MaxRetriesExceeded
        );

        let vrf_seed = {
            use solana_program::hash::hashv;
            // ADR-0021: `draw_attempt` salts the seed so a shortfall redraw
            // selects fresh seats without advancing `round_idx` (which would
            // grow the panel / consume an appeal budget).
            hashv(&[
                &committed_vrf,
                dispute_key.as_ref(),
                &round_idx.to_le_bytes(),
                &round.draw_attempt.to_le_bytes(),
            ])
            .to_bytes()
        };

        for retry in 0..=retries {
            let r_i = {
                use solana_program::hash::hashv;
                let rh = hashv(&[&vrf_seed, &seat.to_le_bytes(), &retry.to_le_bytes()]).to_bytes();
                u64::from_le_bytes(rh[0..8].try_into().unwrap_or([0u8; 8]))
                    % dispute.frozen_total_stake
            };
            if retry < retries {
                // Prior retry: must collide with an already-drawn seat's range.
                let mut collided = false;
                for j in 0..(seat as usize) {
                    let p = round.seat_prefix[j];
                    let s = round.seat_stake[j];
                    if s > 0 && r_i >= p && r_i - p < s {
                        collided = true;
                        break;
                    }
                }
                require!(collided, AccordError::SortitionMismatch);
            } else {
                // Terminal retry: r_i must select the submitted leaf.
                require!(r_i >= prefix, AccordError::SortitionMismatch);
                require!(r_i - prefix < leaf.stake, AccordError::SortitionMismatch);
            }
        }

        // Juror must be distinct from already-drawn seats.
        for j in 0..(panel as usize) {
            require!(round.jurors[j] != leaf.juror, AccordError::DuplicateJuror);
        }

        // Store the drawn seat's range for future collision checks.
        round.seat_prefix[seat as usize] = prefix;
        round.seat_stake[seat as usize] = leaf.stake;

        // Inflation guard + slash reserve check via remaining_accounts[0].
        // PROG-ATTESTTION: gated pools also carry the juror's SAS attestation
        // as remaining_accounts[1] (defense-in-depth draw-time re-check below).
        let gated = ctx.accounts.subaccord.juror_credential != Pubkey::default();
        require!(
            ctx.remaining_accounts.len() == if gated { 2 } else { 1 },
            AccordError::InvalidPanelSize
        );
        let js_info = &ctx.remaining_accounts[0];
        let expected_pda = Pubkey::find_program_address(
            &[
                SEED_JUROR_STAKE,
                dispute.subaccord.as_ref(),
                leaf.juror.as_ref(),
            ],
            &crate::ID,
        )
        .0;
        require!(
            js_info.key == &expected_pda,
            AccordError::InvalidMembershipProof
        );
        require!(
            js_info.owner == &crate::ID,
            AccordError::InvalidMembershipProof
        );
        let slash_per_juror = (dispute.terms.alpha_bps as u64)
            .checked_mul(dispute.terms.min_stake)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(AccordError::ArithmeticOverflow)?;
        let (current_draws, new_slash_reserve) = {
            let data = js_info.try_borrow_data()?;
            let js = JurorStake::try_deserialize(&mut &data[..])?;
            require!(js.juror == leaf.juror, AccordError::InvalidMembershipProof);
            // ADR-0012 inflation guard: live staked must cover the frozen leaf.
            require!(js.staked >= leaf.stake, AccordError::InflatedStake);
            // REVIEW #5: free stake must cover this draw's slash + min_stake.
            let free_stake = js.staked.saturating_sub(js.slash_reserve);
            let required = dispute
                .terms
                .min_stake
                .checked_add(slash_per_juror)
                .ok_or(AccordError::ArithmeticOverflow)?;
            require!(free_stake >= required, AccordError::InsufficientStake);
            let new_reserve = js
                .slash_reserve
                .checked_add(slash_per_juror)
                .ok_or(AccordError::ArithmeticOverflow)?;
            (js.active_draws, new_reserve)
        };
        let new_draws = current_draws
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;
        {
            let mut data = js_info.try_borrow_mut_data()?;
            // CU-opt field write — see `crate::layout` (raw remaining_accounts
            // AccountInfo: no Anchor auto-serialize; write only the 2 changed fields).
            const ACTIVE_DRAWS_OFFSET: usize = crate::layout::JS_ACTIVE_DRAWS_OFF;
            const SLASH_RESERVE_OFFSET: usize = crate::layout::JS_SLASH_RESERVE_OFF;
            data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                .copy_from_slice(&new_draws.to_le_bytes());
            data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
                .copy_from_slice(&new_slash_reserve.to_le_bytes());
        }
        // PROG-ATTESTTION: defense-in-depth credential re-check. With the prune
        // crank an expired juror should already be evicted from the accumulator;
        // this catches the race (credential expired between prune-eligible and
        // prune-called). One attestation read + one timestamp compare, only on
        // gated pools. At draw time only `expiry > now` is required (the
        // stake-time horizon gate already bounded the entry).
        if gated {
            let att = &ctx.remaining_accounts[1];
            let now = Clock::get()?.unix_timestamp;
            let expiry = validate_sas_attestation(
                att,
                &ctx.accounts.subaccord.juror_credential,
                &ctx.accounts.subaccord.juror_schema,
                &leaf.juror,
            )?;
            require!(expiry == 0 || expiry > now, AccordError::AttestationExpired);
        }

        round.jurors[seat as usize] = leaf.juror;
        round.juror_count = round
            .juror_count
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // When the panel fills, open the round windows and transition to Drawn.
        // Ugly 6: windows are filing-time (frozen on the dispute).
        if round.juror_count >= panel {
            let now_ts = Clock::get()?.unix_timestamp;
            let review_end = now_ts
                .checked_add(dispute.terms.review_window as i64)
                .ok_or(AccordError::ArithmeticOverflow)?;
            let commit_end = review_end
                .checked_add(dispute.terms.commit_window as i64)
                .ok_or(AccordError::ArithmeticOverflow)?;
            let reveal_end = commit_end
                .checked_add(dispute.terms.reveal_window as i64)
                .ok_or(AccordError::ArithmeticOverflow)?;
            round.review_end = review_end;
            round.commit_end = commit_end;
            round.reveal_end = reveal_end;
            dispute.state = DisputeState::Drawn;
        }

        emit!(SeatDrawn {
            dispute: dispute_key,
            round_idx,
            seat,
            juror: leaf.juror,
        });
        Ok(())
    }
}
