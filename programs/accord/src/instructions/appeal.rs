use crate::{constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Account context for `appeal` (ADR-0004). Permissionless: `appellant` is any
/// signer. The resolved round (`current_round`) is read for the appeal-window
/// deadline and the prior ruling; the fee + bond move from the appellant's ATA
/// into the vault. The bond is custodied in a per-appeal `AppealBond` PDA keyed
/// by the round being appealed (`current_round`, before it is incremented).
#[derive(Accounts)]
pub struct Appeal<'info> {
    #[account(mut)]
    pub appellant: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.domain_ref.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    // ponytail: `accord_state` is retained here for IDL/SDK stability but is NOT
    // consulted — `appeal` is never pausable (ADR-0016). Drop this field in a
    // coordinated IDL revision (pair with the accord-r6ti settlement rework).
    #[account(seeds = [SEED_ACCORD_STATE], bump = accord_state.bump)]
    pub accord_state: Account<'info, AccordState>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    /// The round just resolved (`dispute.current_round`) — read-only; supplies
    /// `reveal_end` for the appeal-window check and `result` (the prior ruling).
    #[account(
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
    /// Per-appeal bond custody (ADR-0004). Keyed by the round being appealed.
    #[account(
        init,
        payer = appellant,
        space = 8 + AppealBond::INIT_SPACE,
        seeds = [SEED_APPEAL_BOND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub appeal_bond: Box<Account<'info, AppealBond>>,
    #[account(address = subaccord.fee_token)]
    pub fee_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = appellant,
    )]
    pub appellant_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = appellant,
        associated_token::mint = fee_token,
        associated_token::authority = subaccord,
    )]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Appeal<'info> {
    pub fn handler_appeal(ctx: Context<Appeal>, new_evidence_hash: [u8; 32]) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require_eq!(
            dispute.subaccord,
            ctx.accounts.subaccord.key(),
            AccordError::SubaccordMismatch
        );
        require!(
            dispute.state == DisputeState::RoundResolved,
            AccordError::InvalidState
        );

        let sub = &mut ctx.accounts.subaccord;
        // Cap: `current_round` is the round just resolved. Appealing opens round
        // `current_round + 1`, i.e. appeal number `current_round + 1`. The
        // number of appeals must not exceed `max_appeals`. Ugly 6: the cap is
        // the filing-time value (frozen on the dispute).
        require!(
            dispute.current_round < u32::from(dispute.terms.max_appeals),
            AccordError::MaxAppealsReached
        );

        let round = ctx.accounts.round.load()?;
        let prior_result = round.result;
        require!(prior_result != u8::MAX, AccordError::InvalidState);

        let now = Clock::get()?.unix_timestamp;
        let appeal_deadline = round
            .reveal_end
            .checked_add(dispute.terms.appeal_window as i64)
            .ok_or(AccordError::ArithmeticOverflow)?;
        require!(now < appeal_deadline, AccordError::AppealWindowClosed);

        // New panel = 2N+1 (closed form `(J+1)·2^k − 1`, capped at MAX_JURORS).
        // Ugly 6: panel base + fee are filing-time (frozen on the dispute).
        let new_round = dispute
            .current_round
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let panel_new = panel_size_for_round(new_round, dispute.terms.min_jury_size)?;
        require!(
            sub.staker_count >= panel_new,
            AccordError::InsufficientJurors
        );

        // Exponential cost: new-round fee + appeal bond (bond == new-round fee).
        let fee_new = (panel_new as u64)
            .checked_mul(dispute.terms.fee_per_juror)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let bond = fee_new;
        let total = fee_new
            .checked_add(bond)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Custody fee + bond: appellant ATA -> Subaccord PDA fee_vault (ADR-0020).
        let before = ctx.accounts.fee_vault.amount;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.appellant_token_account.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                    authority: ctx.accounts.appellant.to_account_info(),
                },
            ),
            total,
        )?;
        ctx.accounts.fee_vault.reload()?;
        let after = ctx.accounts.fee_vault.amount;
        let delta = after
            .checked_sub(before)
            .ok_or(AccordError::ArithmeticOverflow)?;
        sub.fee_vault_deposited = sub
            .fee_vault_deposited
            .checked_add(delta)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Record the appeal bond in its own PDA for settlement. `prior_result`
        // captures the ruling the appellant seeks to flip (the just-resolved
        // round's winner); flip detection at `finalize_dispute` compares it
        // against the final ruling.
        let bond_acc = &mut ctx.accounts.appeal_bond;
        bond_acc.dispute = dispute.key();
        bond_acc.round_idx = new_round;
        bond_acc.appellant = ctx.accounts.appellant.key();
        bond_acc.amount = total;
        bond_acc.prior_result = prior_result;
        bond_acc.bump = ctx.bumps.appeal_bond;

        // Ownership boundary (bean accord-xftx): the appeal fee lives ONLY in
        // `AppealBond.amount` (fee + bond), never in `dispute.fee_paid`. The
        // filer's `fee_paid` owns exclusively the round-0 filing fee; folding
        // the appeal fee in here caused a double-refund on cancel (filer via
        // fee_paid, appellant via the bond — same fee, two claimants).

        // Open the new round: bump `current_round` and reset to `Created` so the
        // snapshot → draw → vote cycle reruns for the larger panel.  Stamp
        // `filed_at = now` so the pre-draw cancel timeout starts fresh — without
        // this, the original filing timestamp (long past) makes the dispute
        // immediately cancelable (REVIEW #2).
        dispute.current_round = new_round;
        dispute.state = DisputeState::Created;
        dispute.filed_at = now;
        // Per-round evidence (milestone accord-qp7c): stash the appellant's
        // new evidence at the new round's slot. `[0u8; 32]` sentinel = no new
        // evidence this round (jurors reuse prior rounds'). The max_appeals
        // gate above guarantees `new_round <= MAX_APPEALS`, so the index is
        // in-bounds and the slot is virgin (sequential per-round writes).
        dispute.evidence_hashes[new_round as usize] = new_evidence_hash;

        emit!(Appealed {
            dispute: dispute.key(),
            new_round_idx: new_round,
            appellant: ctx.accounts.appellant.key(),
            deposit: total,
        });
        Ok(())
    }
}
