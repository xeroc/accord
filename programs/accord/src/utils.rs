//! Shared handler helpers: `UpdatePayload` domain validation, the MST
//! accumulator math (ADR-0012), panel sizing, and the raw-account
//! settlement / cancel / release utilities (CU-opt field writes — see
//! `constants::layout`).

use crate::{constants::*, errors::AccordError, state::*};
use anchor_lang::prelude::*;

/// Validate a single `UpdatePayload` variant against the same domain bounds
/// enforced at `create_subaccord` (H-1 / shared-base §29.3: validate in every
/// write path). Called from both `propose_subaccord_update` (early rejection)
/// and `execute_subaccord_update` (defense-in-depth).
pub(crate) fn validate_update_payload(payload: &UpdatePayload) -> Result<()> {
    match payload {
        UpdatePayload::AlphaBps(v) => require!(*v <= 10_000, AccordError::InvalidThreshold),
        UpdatePayload::MaxAppeals(v) => {
            require!(
                *v as usize <= MAX_APPEALS,
                AccordError::MaxAppealsLimitExceeded
            )
        }
        UpdatePayload::AppealWindow(v) => {
            require!(
                *v >= MIN_APPEAL_WINDOW_SECS,
                AccordError::AppealWindowTooShort
            )
        }
        UpdatePayload::MinStake(v) => require!(*v > 0, AccordError::InvalidAmount),
        UpdatePayload::FeePerJuror(v) => {
            (MAX_JURORS as u64)
                .checked_mul(*v)
                .ok_or(AccordError::ArithmeticOverflow)?;
        }
        // Windows must be > 0 to keep the state machine reachable (§29.2).
        UpdatePayload::ReviewWindow(v) => require!(*v > 0, AccordError::InvalidAmount),
        UpdatePayload::CommitWindow(v) => require!(*v > 0, AccordError::InvalidAmount),
        UpdatePayload::RevealWindow(v) => require!(*v > 0, AccordError::InvalidAmount),
        // Authority / EvidenceOperator are arbitrary Pubkeys — no domain bound.
        UpdatePayload::Authority(_) | UpdatePayload::EvidenceOperator(_) => {}
    }
    Ok(())
}

/// Cross-field validation that needs the live Subaccord (SR2-L-1, shared-base
/// §28.3 / §29.3): a `MaxAppeals` update must not birth the degenerate appeal
/// ladder that `create_subaccord` rejects — `(min_jury_size+1)·2^v − 1` must
/// stay `≤ MAX_JURORS`. `min_jury_size` is immutable (absent from
/// `UpdatePayload`), so validating against the live pool at BOTH propose and
/// execute is sound.
pub(crate) fn validate_update_cross_field(sub: &Subaccord, payload: &UpdatePayload) -> Result<()> {
    if let UpdatePayload::MaxAppeals(v) = payload {
        let ladder_top = (sub.min_jury_size as u64)
            .checked_add(1)
            .and_then(|x| x.checked_shl(u32::from(*v)))
            .and_then(|x| x.checked_sub(1))
            .ok_or(AccordError::ArithmeticOverflow)?;
        require!(
            ladder_top <= MAX_JURORS as u64,
            AccordError::LadderExceedsMaxJurors
        );
    }
    Ok(())
}

// --- Accumulator MST helpers (ADR-0012) ---------------------------------------

/// Leaf hash: `H(juror || stake_le)`.
pub(crate) fn mst_leaf_hash(juror: &Pubkey, stake: u64) -> [u8; 32] {
    use solana_program::hash::hashv;
    hashv(&[juror.as_ref(), &stake.to_le_bytes()]).to_bytes()
}

/// Internal node hash: `H(left_hash || left_sum || right_hash || right_sum)`.
/// Sums are bound into the hash (CONCEPT-REVIEW Bad 5 fixed by construction).
pub(crate) fn mst_node_hash(
    left_hash: &[u8; 32],
    left_sum: u64,
    right_hash: &[u8; 32],
    right_sum: u64,
) -> [u8; 32] {
    use solana_program::hash::hashv;
    hashv(&[
        left_hash,
        &left_sum.to_le_bytes(),
        right_hash,
        &right_sum.to_le_bytes(),
    ])
    .to_bytes()
}

/// Root hash of an all-zero tree at `depth` (every leaf = `(default, 0)`, every
/// sum = 0). The initial accumulator state before any stake lands.
pub(crate) fn empty_tree_root(depth: u8) -> [u8; 32] {
    let mut h = mst_leaf_hash(&Pubkey::default(), 0);
    for _ in 0..depth {
        h = mst_node_hash(&h, 0, &h, 0);
    }
    h
}

/// Verify the leaf `(old_juror, old_stake)` at `index` authenticates against the
/// stored `(stored_root, stored_sum)`, then recompute the root for a new leaf
/// `(new_juror, new_stake)`. Used by `stake`/`unstake` to advance the canonical
/// accumulator root on every verified update. Returns
/// `Err(InvalidMerklePath)` if the supplied path does not authenticate.
///
/// `old_juror != new_juror` only on a juror's first stake (the assigned slot
/// transitions from the all-zero leaf to the real juror); otherwise both are
/// the juror's identity and only the stake changes.
#[allow(clippy::too_many_arguments)]
pub(crate) fn verify_and_recompute(
    old_juror: &Pubkey,
    old_stake: u64,
    new_juror: &Pubkey,
    new_stake: u64,
    index: u32,
    path: &[MSTNode],
    stored_root: &[u8; 32],
    stored_sum: u64,
) -> Result<([u8; 32], u64)> {
    // ponytail: 8 args are intrinsic to verify-then-recompute (old/new juror+stake,
    // position, path, stored root+sum). A params struct is ceremony for one caller.
    // --- Verify: walk the supplied path from the old leaf to the root. ---
    let mut acc_hash = mst_leaf_hash(old_juror, old_stake);
    let mut acc_sum = old_stake;
    for (level, sib) in path.iter().enumerate() {
        if level >= 31 {
            return Err(AccordError::InvalidMerklePath.into());
        }
        let leaf_is_left = (index >> level) & 1 == 0;
        let (lh, ls, rh, rs) = if leaf_is_left {
            (acc_hash, acc_sum, sib.sibling_hash, sib.sibling_sum)
        } else {
            (sib.sibling_hash, sib.sibling_sum, acc_hash, acc_sum)
        };
        acc_hash = mst_node_hash(&lh, ls, &rh, rs);
        acc_sum = ls.checked_add(rs).ok_or(AccordError::ArithmeticOverflow)?;
    }
    if &acc_hash != stored_root || acc_sum != stored_sum {
        return Err(AccordError::InvalidMerklePath.into());
    }

    // --- Recompute: walk the same path from the new leaf to a new root. ---
    let mut new_hash = mst_leaf_hash(new_juror, new_stake);
    let mut new_sum = new_stake;
    for (level, sib) in path.iter().enumerate() {
        let leaf_is_left = (index >> level) & 1 == 0;
        let (lh, ls, rh, rs) = if leaf_is_left {
            (new_hash, new_sum, sib.sibling_hash, sib.sibling_sum)
        } else {
            (sib.sibling_hash, sib.sibling_sum, new_hash, new_sum)
        };
        new_hash = mst_node_hash(&lh, ls, &rh, rs);
        new_sum = ls.checked_add(rs).ok_or(AccordError::ArithmeticOverflow)?;
    }
    Ok((new_hash, new_sum))
}

/// Verify `leaf` at `index` authenticates against `(root_hash, root_sum)` and
/// return the cumulative-from-left prefix (total stake of all leaves to the
/// left of `index`), reconstructed from the authenticated sibling sums. The
/// leaf's sortition range is `[prefix, prefix + stake)`. Used by `draw_seat`.
pub(crate) fn verify_membership_and_prefix(
    leaf: &LeafClaim,
    index: u32,
    path: &[MSTNode],
    root_hash: &[u8; 32],
    root_sum: u64,
) -> Result<u64> {
    let mut acc_hash = mst_leaf_hash(&leaf.juror, leaf.stake);
    let mut acc_sum = leaf.stake;
    let mut prefix: u64 = 0;
    for (level, sib) in path.iter().enumerate() {
        if level >= 31 {
            return Err(AccordError::InvalidMembershipProof.into());
        }
        let leaf_is_left = (index >> level) & 1 == 0;
        let (lh, ls, rh, rs) = if leaf_is_left {
            (acc_hash, acc_sum, sib.sibling_hash, sib.sibling_sum)
        } else {
            // Leaf is the right child → the left sibling's subtree is entirely
            // to the left of the leaf, so its authenticated sum feeds the prefix.
            prefix = prefix
                .checked_add(sib.sibling_sum)
                .ok_or(AccordError::ArithmeticOverflow)?;
            (sib.sibling_hash, sib.sibling_sum, acc_hash, acc_sum)
        };
        acc_hash = mst_node_hash(&lh, ls, &rh, rs);
        acc_sum = ls.checked_add(rs).ok_or(AccordError::ArithmeticOverflow)?;
    }
    if &acc_hash != root_hash || acc_sum != root_sum {
        return Err(AccordError::InvalidMembershipProof.into());
    }
    Ok(prefix)
}

/// Required panel size for a given round index, seeded by `base` (the
/// per-Subaccord `min_jury_size`, accord-9q3e). The appeal ladder grows it via
/// `N_{k+1} = 2·N_k + 1` (closed form `(base+1)·2^k − 1`); for the default
/// `base = 3`: round 0 = 3, round 1 = 7, round 2 = 15, round 3 = 31 — capped at
/// `MAX_JURORS` (31). `base` comes from the dispute's frozen `CaseTerms`, so a
/// governance panel-size change never affects an in-flight dispute.
pub(crate) fn panel_size_for_round(round_idx: u32, base: u32) -> Result<u32> {
    if round_idx >= 31 {
        return Err(AccordError::ArithmeticOverflow.into());
    }
    let factor = 1u32
        .checked_shl(round_idx)
        .ok_or(AccordError::ArithmeticOverflow)?;
    let panel = base
        .checked_add(1)
        .ok_or(AccordError::ArithmeticOverflow)?
        .checked_mul(factor)
        .ok_or(AccordError::ArithmeticOverflow)?
        .checked_sub(1)
        .ok_or(AccordError::ArithmeticOverflow)?;
    Ok(panel.min(MAX_JURORS as u32))
}

/// Read and sum AppealBond `amount` fields from `accounts[start..start+n]`.
/// Verifies each PDA against `["bond", dispute_key, i]`. Used by
/// `cancel_dispute` to compute the vault reserve for appeal refunds.
pub(crate) fn read_bond_amounts<'info>(
    accounts: &'info [AccountInfo<'info>],
    dispute_key: &Pubkey,
    start: usize,
    n: usize,
) -> Result<u64> {
    if n == 0 {
        return Ok(0);
    }
    const BOND_AMOUNT_OFFSET: usize = crate::layout::AB_AMOUNT_OFF; // CU-opt — see crate::layout
    let mut total: u64 = 0;
    for i in 0..n {
        let expected_pda = Pubkey::find_program_address(
            &[
                SEED_APPEAL_BOND,
                dispute_key.as_ref(),
                &(i as u32).to_le_bytes(),
            ],
            &crate::ID,
        )
        .0;
        let bond_info = &accounts[start + i];
        require!(
            bond_info.key == &expected_pda,
            AccordError::InvalidMembershipProof
        );
        require!(
            bond_info.owner == &crate::ID,
            AccordError::InvalidMembershipProof
        );
        let d = bond_info.try_borrow_data()?;
        require!(
            d.len() >= BOND_AMOUNT_OFFSET + 8,
            AccordError::InvalidMembershipProof
        );
        let amt = u64::from_le_bytes(
            d[BOND_AMOUNT_OFFSET..BOND_AMOUNT_OFFSET + 8]
                .try_into()
                .unwrap(),
        );
        total = total
            .checked_add(amt)
            .ok_or(AccordError::ArithmeticOverflow)?;
    }
    Ok(total)
}

/// Release `active_draws` for every juror in every prior round
/// (`0..current_round`). Used by `cancel_dispute` so that appeal-escalated
/// disputes that stall don't permanently lock prior-round jurors
/// (REVIEW #2).  Each round's `JurorStake` PDAs must follow the `Round` PDA
/// in `remaining_accounts`, laid out sequentially starting at `start`.
/// Returns the index past the last consumed account.
pub(crate) fn release_prior_rounds<'info>(
    accounts: &'info [AccountInfo<'info>],
    dispute_key: &Pubkey,
    sub_key: &Pubkey,
    start: usize,
    current_round: u32,
    slash_per_juror: u64,
) -> Result<usize> {
    if current_round == 0 {
        return Ok(start);
    }
    let mut idx = start;
    // CU-opt field access — see `crate::layout`.
    const ACTIVE_DRAWS_OFFSET: usize = crate::layout::JS_ACTIVE_DRAWS_OFF;
    const SLASH_RESERVE_OFFSET: usize = crate::layout::JS_SLASH_RESERVE_OFF;
    for round_idx in 0..current_round {
        require!(idx < accounts.len(), AccordError::InvalidState);
        let round_info = &accounts[idx];
        let expected = Pubkey::find_program_address(
            &[SEED_ROUND, dispute_key.as_ref(), &round_idx.to_le_bytes()],
            &crate::ID,
        )
        .0;
        require!(
            round_info.key == &expected,
            AccordError::InvalidMembershipProof
        );

        let jurors: Vec<Pubkey> = {
            let loader = AccountLoader::<Round>::try_from(round_info)?;
            let round = loader.load()?;
            round.jurors[..round.juror_count as usize].to_vec()
        };
        let count = jurors.len();
        idx += 1;
        require!(idx + count <= accounts.len(), AccordError::InvalidPanelSize);

        for j in 0..count {
            let acct_info = &accounts[idx + j];
            let expected_pda = Pubkey::find_program_address(
                &[SEED_JUROR_STAKE, sub_key.as_ref(), jurors[j].as_ref()],
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
            if data.len() >= SLASH_RESERVE_OFFSET + 8 {
                let reserve = u64::from_le_bytes(
                    data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
                        .try_into()
                        .unwrap(),
                );
                let new_reserve = reserve.saturating_sub(slash_per_juror);
                data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
                    .copy_from_slice(&new_reserve.to_le_bytes());
            }
        }
        idx += count;
    }
    Ok(idx)
}

/// Shared per-round coherence settlement (CONCEPT-REVIEW Ugly 5 / accord-r6ti,
/// ADR-0020 two-mint rework).
///
/// Judges every drawn juror against `final_ruling` (NOT the round's own result),
/// slashes incoherent/non-revealing jurors by `α·min_stake`, and redistributes
/// two distinct pools:
/// - **stake pool** (`stake_token`): slash proceeds → written to `stake_delta`.
/// - **fee pool** (`fee_token`): non-revealer fees + forfeited bonds → written
///   to `fees_earned`. Revealers already received their base `fee_per_juror`
///   credit at `finalize_round`; only the forfeited portion redistributes here.
///
/// Recipient selection (bean accord-aqmw):
/// - `coherent_count > 0`: pools split among **coherent** jurors (normal).
/// - `coherent_count == 0, reveal_count > 0`: pools split among **revealers** —
///   those who at least participated, even though none matched the final
///   ruling (typically a prior round overturned on appeal). Non-revealers are
///   slashed but receive no reward.
/// - `coherent_count == 0, reveal_count == 0`: nobody is rewarded. Both pools
///   are trapped in vault custody as permanent Subaccord protocol surplus
///   (follow-up: authority-claimable withdrawal).
///
/// Decrements `active_draws` for every drawn juror (releases the unstake lock).
///
/// `pool_extra` is the forfeited (no-flip) appeal-bond total (final round only;
/// 0 for prior rounds). All adjustments are ledger-only — no SPL transfers.
pub(crate) fn settle_round_accounts(
    round: &Round,
    terms: &CaseTerms,
    sub_key: &Pubkey,
    accounts: &[AccountInfo],
    final_ruling: u64,
    pool_extra: u64,
) -> Result<()> {
    let panel = round.juror_count as usize;
    require!(accounts.len() == panel, AccordError::InvalidPanelSize);

    let slash_per_juror = (terms.alpha_bps as u64)
        .checked_mul(terms.min_stake)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(AccordError::ArithmeticOverflow)?;

    // Coherence judge (ADR-0025): Plurality — exact option match; Median — a
    // tolerance band around the final median, `|vote − ruling| · 10_000 ≤
    // ruling · coherence_tol_bps` (u128 so `ruling · bps` cannot overflow).
    let judge_coherent = |vote: u64| -> bool {
        if vote == u64::MAX || final_ruling == u64::MAX {
            return false;
        }
        match terms.aggregation {
            Aggregation::Plurality => vote == final_ruling,
            Aggregation::Median => {
                let diff = vote.abs_diff(final_ruling) as u128;
                diff * 10_000 <= (final_ruling as u128) * (terms.coherence_tol_bps as u128)
            }
        }
    };

    // --- First pass: verify PDAs + compute coherence stats ---
    let mut coherent_count: u32 = 0;
    let mut slash_total: u64 = 0;
    for (i, acct) in accounts.iter().enumerate() {
        let expected_pda = Pubkey::find_program_address(
            &[SEED_JUROR_STAKE, sub_key.as_ref(), round.jurors[i].as_ref()],
            &crate::ID,
        )
        .0;
        require!(
            acct.key == &expected_pda,
            AccordError::InvalidMembershipProof
        );
        require!(
            acct.owner == &crate::ID,
            AccordError::InvalidMembershipProof
        );

        // SR2-L-3 (security review 2026-08-19): the credit pool must equal
        // the debit pool — cap each juror's contribution at their live
        // `staked`, exactly as the debit pass below does
        // (`min(slash_per_juror, staked)`). `draw_seat`'s per-draw free-stake
        // gate (`free ≥ min_stake + α·min_stake`) makes the cap a no-op
        // today; keeping the two passes symmetric converts any future
        // violation into a smaller payout instead of stake_delta rewards
        // minted from nothing (ledger insolvency).
        let staked = {
            const STAKED_OFF: usize = crate::layout::JS_STAKED_OFF;
            let data = acct.try_borrow_data()?;
            require!(
                data.len() >= STAKED_OFF + 8,
                AccordError::InvalidMembershipProof
            );
            u64::from_le_bytes(data[STAKED_OFF..STAKED_OFF + 8].try_into().unwrap())
        };
        if judge_coherent(round.reveals[i]) {
            coherent_count += 1;
        } else {
            slash_total = slash_total
                .checked_add(slash_per_juror.min(staked))
                .ok_or(AccordError::ArithmeticOverflow)?;
        }
    }

    // Fee pool (fee_token): non-revealer fees + forfeited bonds (ADR-0020).
    // Revealers already got their base fee at finalize_round; only the
    // forfeited portion redistributes here.
    let non_revealer_fee = ((panel as u64).saturating_sub(round.reveal_count as u64))
        .checked_mul(terms.fee_per_juror)
        .ok_or(AccordError::ArithmeticOverflow)?;
    let fee_pool = non_revealer_fee
        .checked_add(pool_extra)
        .ok_or(AccordError::ArithmeticOverflow)?;

    // Recipient pool: coherent jurors normally; when none are coherent
    // (a prior round overturned on appeal, or a degenerate
    // reveal_threshold_bps = 0 config), fall back to revealers — those
    // who at least participated. Non-revealers are NEVER rewarded.
    // When reveal_count is also 0 (no-show round), reward_count = 0 and
    // both pools are trapped in vault custody as permanent Subaccord
    // protocol surplus (bean accord-aqmw / follow-up: make claimable via
    // authority withdrawal). Integer-div remainder → protocol surplus.
    let reward_count: u32 = if coherent_count > 0 {
        coherent_count
    } else {
        round.reveal_count
    };
    let stake_share = if reward_count > 0 {
        slash_total / reward_count as u64
    } else {
        0
    };
    let fee_share = if reward_count > 0 {
        fee_pool / reward_count as u64
    } else {
        0
    };

    // --- Second pass: apply slashes/rewards to stake_delta + fees_earned + decrement draws ---
    // ADR-0020: do NOT mutate `staked` — the accumulator root commits to it.
    // Write the net stake_delta instead; `reconcile_stake` folds it into
    // `staked` later via a Merkle proof. Fee rewards go to `fees_earned`.
    // CU-opt field access — see `crate::layout`.
    const STAKED_OFFSET: usize = crate::layout::JS_STAKED_OFF;
    const ACTIVE_DRAWS_OFFSET: usize = crate::layout::JS_ACTIVE_DRAWS_OFF;
    const STAKE_DELTA_OFFSET: usize = crate::layout::JS_STAKE_DELTA_OFF;
    const SLASH_RESERVE_OFFSET: usize = crate::layout::JS_SLASH_RESERVE_OFF;
    const FEES_EARNED_OFFSET: usize = crate::layout::JS_FEES_EARNED_OFF;

    for (i, acct_info) in accounts.iter().enumerate() {
        let is_coherent = judge_coherent(round.reveals[i]);

        let (staked, active_draws, existing_delta, slash_reserve, existing_fees) = {
            let data = acct_info.try_borrow_data()?;
            if data.len() < FEES_EARNED_OFFSET + 8 {
                return Err(AccordError::InvalidMembershipProof.into());
            }
            let stk =
                u64::from_le_bytes(data[STAKED_OFFSET..STAKED_OFFSET + 8].try_into().unwrap());
            let draws = u32::from_le_bytes(
                data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                    .try_into()
                    .unwrap(),
            );
            let delta = i64::from_le_bytes(
                data[STAKE_DELTA_OFFSET..STAKE_DELTA_OFFSET + 8]
                    .try_into()
                    .unwrap(),
            );
            let reserve = u64::from_le_bytes(
                data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
                    .try_into()
                    .unwrap(),
            );
            let fees = u64::from_le_bytes(
                data[FEES_EARNED_OFFSET..FEES_EARNED_OFFSET + 8]
                    .try_into()
                    .unwrap(),
            );
            (stk, draws, delta, reserve, fees)
        };

        // Slash every non-coherent juror (incoherent voter or no-show).
        // Reward eligibility: coherent normally; revealers as fallback when
        // no juror is coherent. Non-revealers are never rewarded.
        let is_reward_eligible = if coherent_count > 0 {
            is_coherent
        } else {
            round.reveals[i] != u64::MAX
        };
        let slash_delta = if is_coherent {
            0i64
        } else {
            -(slash_per_juror.min(staked) as i64)
        };
        let new_delta =
            existing_delta
                .saturating_add(slash_delta)
                .saturating_add(if is_reward_eligible {
                    stake_share as i64
                } else {
                    0
                });
        let new_fees = if is_reward_eligible {
            existing_fees
                .checked_add(fee_share)
                .ok_or(AccordError::ArithmeticOverflow)?
        } else {
            existing_fees
        };
        let new_draws = active_draws.saturating_sub(1);
        let new_reserve = slash_reserve.saturating_sub(slash_per_juror);

        let mut data = acct_info.try_borrow_mut_data()?;
        data[STAKE_DELTA_OFFSET..STAKE_DELTA_OFFSET + 8].copy_from_slice(&new_delta.to_le_bytes());
        data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
            .copy_from_slice(&new_draws.to_le_bytes());
        data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
            .copy_from_slice(&new_reserve.to_le_bytes());
        data[FEES_EARNED_OFFSET..FEES_EARNED_OFFSET + 8].copy_from_slice(&new_fees.to_le_bytes());
    }

    Ok(())
}
