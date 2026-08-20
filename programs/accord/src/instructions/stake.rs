use crate::{attestation::*, constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Account context for `stake` (veridao-ja2w).
///
/// - `subaccord` is re-derived from its stored seeds (`creator`, `domain_ref`)
///   + canonical bump so a wrong/forged pool is rejected.
/// - `staking_token` is constrained to the Subaccord's declared mint.
/// - `juror_token_account` is the Juror's canonical ATA for that mint.
/// - `vault` is the **Subaccord PDA's** ATA (lazily created on first stake) so
///   the program can move funds out on `unstake` (PDA-signed).
/// - `juror_stake` is init'd on first stake, topped up thereafter
///   (`init_if_needed`); `active_draws` is never touched here.
/// - `accord_state` enforces the ADR-0007 circuit breaker.
#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.domain_ref.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    /// Circuit breaker (ADR-0007): stake reverts while paused.
    #[account(seeds = [SEED_ACCORD_STATE], bump = accord_state.bump)]
    pub accord_state: Account<'info, AccordState>,
    #[account(
        init_if_needed,
        payer = juror,
        space = 8 + JurorStake::INIT_SPACE,
        seeds = [SEED_JUROR_STAKE, subaccord.key().as_ref(), juror.key().as_ref()],
        bump,
    )]
    pub juror_stake: Account<'info, JurorStake>,
    /// Must be the Subaccord's declared staking token.
    #[account(address = subaccord.staking_token)]
    pub staking_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = juror,
    )]
    pub juror_token_account: Account<'info, TokenAccount>,
    /// Subaccord PDA's stake_vault ATA; `authority` (wallet) is the Subaccord PDA.
    #[account(
        init_if_needed,
        payer = juror,
        associated_token::mint = staking_token,
        associated_token::authority = subaccord,
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Stake<'info> {
    pub fn handler_stake(ctx: Context<Stake>, amount: u64, path: Vec<MSTNode>) -> Result<()> {
        require!(
            !ctx.accounts.accord_state.paused,
            AccordError::ProgramPaused
        );
        require!(amount > 0, AccordError::InvalidAmount);
        // PROG-ATTESTTION: optional credential gate. On a credential-gated
        // Subaccord (`juror_credential != default`), the juror must supply a
        // valid SAS attestation in `remaining_accounts[0]`. On a stake-only
        // Subaccord (both fields `default()`) this block is skipped entirely —
        // today's behavior is unchanged. Scoped so the immutable borrow ends
        // before the mutable `sub` borrow below.
        {
            let sub_acc = &ctx.accounts.subaccord;
            if sub_acc.juror_credential != Pubkey::default() {
                require!(
                    !ctx.remaining_accounts.is_empty(),
                    AccordError::AttestationMissing
                );
                let att = &ctx.remaining_accounts[0];
                let now = Clock::get()?.unix_timestamp;
                let cutoff = now
                    .checked_add(attestation_horizon(sub_acc)?)
                    .ok_or(AccordError::ArithmeticOverflow)?;
                let expiry = validate_sas_attestation(
                    att,
                    &sub_acc.juror_credential,
                    &sub_acc.juror_schema,
                    &ctx.accounts.juror.key(),
                )?;
                // `expiry == 0` ⇒ never expires; otherwise it must outlive the
                // max dispute lifecycle so the credential can't lapse mid-dispute.
                require!(
                    expiry == 0 || expiry > cutoff,
                    AccordError::AttestationExpired
                );
            }
        }

        let before = ctx.accounts.stake_vault.amount;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.juror_token_account.to_account_info(),
                    to: ctx.accounts.stake_vault.to_account_info(),
                    authority: ctx.accounts.juror.to_account_info(),
                },
            ),
            amount,
        )?;

        // Fee-on-transfer safe: reload + credit the real delta the vault got.
        ctx.accounts.stake_vault.reload()?;
        let after = ctx.accounts.stake_vault.amount;
        let delta = after
            .checked_sub(before)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Parallel vault ledger (bean accord-fdad): track the real SPL delta.
        // Ledger-only ops (slash, request_withdraw) never touch this — only
        // actual token transfers in/out of the vault.

        let juror_key = ctx.accounts.juror.key();
        let js = &mut ctx.accounts.juror_stake;
        let sub = &mut ctx.accounts.subaccord;

        // A fresh JurorStake account is zero-filled by `init_if_needed`, so its
        // `subaccord` field is `default()` until we write it — the reliable
        // first-stake signal. An existing juror (top-up / re-stake after full
        // unstake) already has its `tree_index`.
        let is_new_leaf = js.subaccord == Pubkey::default();
        let old_stake = js.staked;
        // SR2-M-2 (security review 2026-08-19): a fully-drained juror whose
        // slot was `reclaim_slot`-ed still holds their JurorStake (kept alive
        // as the free-list node) with `subaccord` set — the plain top-up path
        // below would hash the old leaf as `(juror, 0)` against a root that
        // now contains `(default, 0)` and fail `InvalidMerklePath` forever.
        // Field-level signals cannot detect this (a reclaimed TAIL node also
        // carries `next_free == MAX`, identical to an active juror), so
        // disambiguate cryptographically: the same sibling path authenticates
        // either leaf — test which one the stored root actually contains. A
        // blank leaf re-claims its slot when it is the free-list head (O(1)
        // splice); otherwise `SlotAwaitingRecycle` tells the juror to wait
        // until the slots ahead of theirs are recycled (or another staker
        // pops theirs, closing the account for a fresh init).
        let on_blank_leaf = !is_new_leaf
            && old_stake == 0
            && verify_and_recompute(
                &Pubkey::default(),
                0,
                &Pubkey::default(),
                0,
                js.tree_index,
                &path,
                &sub.root_hash,
                sub.total_stake,
            )
            .is_ok();
        let (index, popped_from_free_list) = if is_new_leaf {
            if sub.free_head != u32::MAX {
                // --- RECLAIM-LEAF: pop from free list ---
                // The freed JurorStake at free_head is a remaining account. Its
                // index is gated-aware: on a credential-gated pool the juror's
                // SAS attestation occupies remaining_accounts[0] (validated
                // above), so the freed slot follows at [1]; on a stake-only pool
                // it sits at [0]. The caller discovers the freed account
                // off-chain (read sub.free_head → find the JurorStake with
                // tree_index == free_head). The program verifies ownership, PDA
                // derivation, and head identity.
                let freed_idx = if sub.juror_credential != Pubkey::default() {
                    1
                } else {
                    0
                };
                require!(
                    ctx.remaining_accounts.len() > freed_idx,
                    AccordError::FreeListHeadMismatch
                );
                let freed_info = &ctx.remaining_accounts[freed_idx];
                require!(
                    freed_info.owner == &crate::ID,
                    AccordError::FreeListHeadMismatch
                );
                let (freed_tree_index, freed_next_free, freed_juror) = {
                    let data = freed_info.try_borrow_data()?;
                    let freed_js = JurorStake::try_deserialize(&mut &data[..])?;
                    require!(
                        freed_js.tree_index == sub.free_head,
                        AccordError::FreeListHeadMismatch
                    );
                    require!(freed_js.staked == 0, AccordError::SlotNotDrained);
                    // SR2-L-4 (security review 2026-08-19, resolved by
                    // analysis): no explicit "is a live free-list node" check
                    // is possible here — a reclaimed TAIL node also carries
                    // `next_free == u32::MAX`, so the sentinel cannot
                    // distinguish it from an active juror. The invariant is
                    // held by construction instead: `reclaim_slot` is the only
                    // head writer and pushes only just-reclaimed nodes, and
                    // this handler's `verify_and_recompute` below proves the
                    // head slot's leaf is the blanked `(default, 0)` — a
                    // never-reclaimed account at the head fails the root
                    // check and the pop never completes. A tail pop setting
                    // `free_head = MAX` is the correct terminal state.
                    // H-1 defense-in-depth: the pop CLOSES this account — it
                    // must not custody a banked withdrawal (reclaim_slot gates
                    // this; kept here so a stale free-list entry from a future
                    // bug cannot trap funds).
                    require!(
                        freed_js.pending_withdrawal == 0,
                        AccordError::SlotNotDrained
                    );
                    (freed_js.tree_index, freed_js.next_free, freed_js.juror)
                };
                let expected_pda = Pubkey::find_program_address(
                    &[SEED_JUROR_STAKE, sub.key().as_ref(), freed_juror.as_ref()],
                    &crate::ID,
                )
                .0;
                require!(
                    freed_info.key == &expected_pda,
                    AccordError::FreeListHeadMismatch
                );
                // Advance head + close the freed account (rent bounty → caller).
                sub.free_head = freed_next_free;
                {
                    let src_lamports = **freed_info.lamports.borrow();
                    **freed_info.lamports.borrow_mut() = 0;
                    **ctx.accounts.juror.lamports.borrow_mut() += src_lamports;
                    let mut data = freed_info.try_borrow_mut_data()?;
                    for b in data.iter_mut() {
                        *b = 0;
                    }
                }
                (freed_tree_index, true)
            } else {
                // --- Bump allocate (unchanged) ---
                require!(
                    (sub.next_index as u64) < (1u64 << sub.depth.min(31)),
                    AccordError::TreeFull
                );
                (sub.next_index, false)
            }
        } else if on_blank_leaf {
            require!(js.juror == juror_key, AccordError::InvalidMembershipProof);
            // Only the head splices in O(1); a mid-list slot must wait.
            require!(
                sub.free_head == js.tree_index,
                AccordError::SlotAwaitingRecycle
            );
            // Drained-gates mirror `reclaim_slot` (defense-in-depth against a
            // stale free-list entry from a future bug).
            require!(
                js.staked == 0
                    && js.active_draws == 0
                    && js.stake_delta == 0
                    && js.fees_earned == 0
                    && js.pending_withdrawal == 0,
                AccordError::SlotNotDrained
            );
            // Splice the own slot off the head. The account stays open and
            // becomes an active leaf again (its subaccord/juror/tree_index/
            // bump fields are already correct).
            sub.free_head = js.next_free;
            js.next_free = u32::MAX;
            emit!(SlotAllocated {
                subaccord: sub.key(),
                juror: juror_key,
                index: js.tree_index,
            });
            (js.tree_index, false)
        } else {
            require!(js.juror == juror_key, AccordError::InvalidMembershipProof);
            (js.tree_index, false)
        };

        // The accumulator leaf currently at `index`: a fresh slot — or a
        // reclaimed one being re-claimed by its original juror — holds the
        // all-zero leaf `(default, 0)`; an existing juror's slot carries its
        // live `(juror, amount)`.
        let (old_juror, old_leaf_stake) = if is_new_leaf || on_blank_leaf {
            (Pubkey::default(), 0u64)
        } else {
            (juror_key, old_stake)
        };

        let new_stake = old_stake
            .checked_add(delta)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // REVIEW #5 backstop: the position-opening deposit must clear the
        // draw-time free-stake threshold — min_stake + α·min_stake — or the
        // juror can never be drawn (each draw_seat reserves α·min_stake and
        // requires free stake ≥ min_stake + α·min_stake). Staking exactly
        // min_stake is the footgun this closes. Top-ups are NOT gated: only the
        // first deposit that opens (or, after a reclaim, re-opens) the leaf.
        if is_new_leaf || on_blank_leaf {
            let slash_per_juror = (sub.alpha_bps as u64)
                .checked_mul(sub.min_stake)
                .and_then(|v| v.checked_div(10_000))
                .ok_or(AccordError::ArithmeticOverflow)?;
            let min_initial = sub
                .min_stake
                .checked_add(slash_per_juror)
                .ok_or(AccordError::ArithmeticOverflow)?;
            require!(new_stake >= min_initial, AccordError::InsufficientStake);
        }

        // Verify the supplied path against the stored root, then recompute the
        // root for the new leaf stake. The juror identity may change
        // (default→real) on first stake; afterwards it is stable.
        let (new_root, new_total) = verify_and_recompute(
            &old_juror,
            old_leaf_stake,
            &juror_key,
            new_stake,
            index,
            &path,
            &sub.root_hash,
            sub.total_stake,
        )?;

        if is_new_leaf {
            js.subaccord = sub.key();
            js.juror = juror_key;
            js.bump = ctx.bumps.juror_stake;
            js.tree_index = index;
            js.next_free = u32::MAX; // active juror, not on the free list
                                     // Only bump next_index on a fresh bump-allocate — a free-list pop
                                     // recycles an existing index.
            if !popped_from_free_list {
                sub.next_index = sub
                    .next_index
                    .checked_add(1)
                    .ok_or(AccordError::ArithmeticOverflow)?;
            }
            if popped_from_free_list {
                emit!(SlotAllocated {
                    subaccord: sub.key(),
                    juror: juror_key,
                    index,
                });
            }
        }
        // active_draws intentionally untouched: 0 on fresh init, preserved on top-up.

        // Coarse distinct-staker counter (SPEC intake gate). First-ever stake
        // (0 -> positive) and re-stake after a full unstake both increment; a
        // full unstake decrements (see `unstake`).
        let prev_staked = js.staked;
        js.staked = new_stake;
        if prev_staked == 0 {
            sub.staker_count = sub
                .staker_count
                .checked_add(1)
                .ok_or(AccordError::ArithmeticOverflow)?;
        }

        sub.root_hash = new_root;
        sub.total_stake = new_total;
        sub.stake_vault_deposited = sub
            .stake_vault_deposited
            .checked_add(delta)
            .ok_or(AccordError::ArithmeticOverflow)?;

        emit!(Staked {
            subaccord: sub.key(),
            juror: juror_key,
            amount: delta,
        });
        Ok(())
    }
}
