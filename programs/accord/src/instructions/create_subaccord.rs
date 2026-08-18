use crate::{constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

/// Account context for `create_subaccord` (veridao-ek65).
///
/// `init` (not `init_if_needed`) enforces the account is fresh, giving the
/// re-init guard and namespace-capture prevention for free. The canonical bump
/// from `find_program_address` is reused and stored on the account.
#[derive(Accounts)]
#[instruction(domain_ref: [u8; 32])]
pub struct CreateSubaccord<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Subaccord::INIT_SPACE,
        seeds = [SEED_SUBACCORD, creator.key().as_ref(), domain_ref.as_ref()],
        bump,
    )]
    pub subaccord: Account<'info, Subaccord>,
    /// L-4: validated as a real legacy SPL Mint — `Account<Mint>` from
    /// `anchor_spl::token` checks ownership against the Token Program ID,
    /// rejecting Token-2022 mints (owned by Token-2022 Program) by construction.
    pub staking_token: Account<'info, Mint>,
    pub fee_token: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateSubaccord<'info> {
    pub fn handler_create_subaccord(
        ctx: Context<CreateSubaccord>,
        domain_ref: [u8; 32],
        evidence_spec: [u8; 32],
        params: CreateSubaccordParams,
    ) -> Result<()> {
        let CreateSubaccordParams {
            min_stake,
            alpha_bps,
            review_window,
            commit_window,
            reveal_window,
            appeal_window,
            max_appeals,
            min_jury_size,
            aggregation,
            fee_per_juror,
            reveal_threshold_bps,
            shortfall_policy,
            max_draw_attempts,
            coherence_tol_bps,
            authority,
            evidence_operator,
            depth,
            juror_credential,
            juror_schema,
        } = params;
        // Namespace guard: reject the degenerate zero-hash domain_ref so the
        // default identity can't be silently squatting a namespace.
        require!(domain_ref != [0u8; 32], AccordError::InvalidOptions);
        // Appeal-bond arrays on `Dispute` are sized to `MAX_APPEALS`; a
        // Subaccord may not promise more appeals than the program can custody.
        // The appeal ladder `(min_jury_size+1)·2^k − 1` must fit `MAX_JURORS`
        // (checked below for the chosen pair); `max_appeals` itself is capped at 3.
        require!(
            max_appeals as usize <= MAX_APPEALS,
            AccordError::MaxAppealsLimitExceeded
        );
        // accord-9q3e: per-Subaccord round-1 panel size. Must be odd (tie
        // avoidance — the closed form keeps every round odd only for odd J) and
        // the full appeal ladder must fit `MAX_JURORS` so the closed form never
        // silently hits the `.min()` cap (which would truncate panel growth).
        // For `min_jury_size = 1` + `max_appeals = 0` the ladder is a single
        // round and never exercised.
        require!(min_jury_size % 2 == 1, AccordError::EvenJurySize);
        let ladder_top = (min_jury_size as u64)
            .checked_add(1)
            .and_then(|v| v.checked_shl(max_appeals as u32))
            .and_then(|v| v.checked_sub(1))
            .ok_or(AccordError::ArithmeticOverflow)?;
        require!(
            ladder_top <= MAX_JURORS as u64,
            AccordError::LadderExceedsMaxJurors
        );
        // ADR-0021: validate the reveal-quorum config.
        require!(
            reveal_threshold_bps <= 10_000,
            AccordError::InvalidThreshold
        );
        require!(
            (1..=MAX_DRAW_ATTEMPTS).contains(&max_draw_attempts),
            AccordError::MaxDrawAttemptsLimitExceeded
        );
        // ADR-0025: coherence tolerance is a bps fraction; 10_000 = ±100%
        // (every non-zero vote coherent). Inert on Plurality pools.
        require!(coherence_tol_bps <= 10_000, AccordError::InvalidThreshold);
        // Accumulator depth bounds the pool at 2^depth. Cap at 31 (u32 index
        // headroom + sane rent/depth tradeoff); the common default is 20.
        require!(depth <= 31, AccordError::TreeFull);
        // ADR-0022: appeal window is per-Subaccord with a non-zero floor. A pool
        // that wants no appeals sets `max_appeals == 0` (the explicit knob); a 0
        // window would silently disable the appeal safety valve.
        require!(
            appeal_window >= MIN_APPEAL_WINDOW_SECS,
            AccordError::AppealWindowTooShort
        );
        // PROG-ATTESTTION: credential binding is both-or-neither. A half-bound
        // Subaccord (credential set, schema unset — or vice versa) is rejected;
        // both `Pubkey::default()` ⇒ stake-only (today's behavior, unchanged).
        require!(
            (juror_credential == Pubkey::default()) == (juror_schema == Pubkey::default()),
            AccordError::AttestationBindingPartial
        );

        let acc = &mut ctx.accounts.subaccord;
        acc.creator = ctx.accounts.creator.key();
        acc.staking_token = ctx.accounts.staking_token.key();
        acc.fee_token = ctx.accounts.fee_token.key();
        acc.min_stake = min_stake;
        acc.alpha_bps = alpha_bps;
        acc.review_window = review_window;
        acc.commit_window = commit_window;
        acc.reveal_window = reveal_window;
        acc.appeal_window = appeal_window;
        acc.max_appeals = max_appeals;
        acc.min_jury_size = min_jury_size;
        acc.aggregation = aggregation;
        acc.fee_per_juror = fee_per_juror;
        acc.reveal_threshold_bps = reveal_threshold_bps;
        acc.shortfall_policy = shortfall_policy;
        acc.max_draw_attempts = max_draw_attempts;
        acc.coherence_tol_bps = coherence_tol_bps;
        acc.authority = authority;
        acc.evidence_operator = evidence_operator;
        acc.domain_ref = domain_ref;
        acc.evidence_spec = evidence_spec;
        // Immutable identity-triplet extension (PROG-ATTESTTION).
        acc.juror_credential = juror_credential;
        acc.juror_schema = juror_schema;
        acc.bump = ctx.bumps.subaccord;
        // ADR-0012 accumulator: start as an all-zero tree at the fixed depth.
        acc.depth = depth;
        acc.next_index = 0;
        acc.total_stake = 0;
        acc.root_hash = empty_tree_root(depth);
        // RECLAIM-LEAF: free list starts empty (no reclaimed slots).
        acc.free_head = u32::MAX;

        emit!(SubaccordCreated {
            creator: ctx.accounts.creator.key(),
            subaccord: acc.key(),
            staking_token: ctx.accounts.staking_token.key(),
            fee_token: ctx.accounts.fee_token.key(),
            domain_ref,
        });
        Ok(())
    }
}
