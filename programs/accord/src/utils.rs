//! Shared handler helpers: `UpdatePayload` domain validation, the MST
//! accumulator math (ADR-0012), panel sizing, and the raw-account
//! settlement / cancel / release utilities (full Anchor (de)serialization —
//! ADR-0032).

use crate::{constants::*, errors::AccordError, state::*};
use anchor_lang::prelude::*;
use anchor_lang::{AccountDeserialize, AccountSerialize};

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
        // ADR-0021 bounds, retunable via the timelock (ADR-0028). The
        // Median > 0 lower bound needs the live pool — see
        // `validate_update_cross_field`.
        UpdatePayload::RevealThresholdBps(v) => {
            require!(*v <= 10_000, AccordError::InvalidThreshold)
        }
        UpdatePayload::MaxDrawAttempts(v) => {
            require!(
                (1..=MAX_DRAW_ATTEMPTS).contains(v),
                AccordError::MaxDrawAttemptsLimitExceeded
            )
        }
    }
    Ok(())
}

/// Cross-field validation that needs the live Subaccord (SR2-L-1, shared-base
/// §28.3 / §29.3). Checked at BOTH propose and execute against the live pool:
///
/// - `MaxAppeals`: must not birth the degenerate appeal ladder that
///   `create_subaccord` rejects — `(min_jury_size+1)·2^v − 1` must stay
///   `≤ MAX_JURORS`. `min_jury_size` is immutable (absent from
///   `UpdatePayload`), so the live value is authoritative.
/// - `RevealThresholdBps` (ADR-0028): a Median pool cannot drop to a zero
///   reveal threshold — the quorum gate would collapse to `needed = 0` and
///   the median arm could fabricate `result = 0` from an empty reveal set
///   (SR2-M-1 gate parity with `create_subaccord`). Plurality pools stay
///   safe at 0 (all-zero tally ties → RedrawEligible, ADR-0026).
///   `aggregation` is immutable (absent from `UpdatePayload`), so the live
///   value is authoritative.
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
    if let UpdatePayload::RevealThresholdBps(v) = payload {
        require!(
            sub.aggregation != Aggregation::Median || *v > 0,
            AccordError::InvalidThreshold
        );
    }
    // ADR-0029: same-mint slash-dominance. Compose the updated leg with the
    // live pool (the two untouched fields are authoritative) and check the
    // numeric pin — only meaningful where staking_token == fee_token.
    let (alpha, min_stake, fee) = match payload {
        UpdatePayload::AlphaBps(v) => (*v, sub.min_stake, sub.fee_per_juror),
        UpdatePayload::MinStake(v) => (sub.alpha_bps, *v, sub.fee_per_juror),
        UpdatePayload::FeePerJuror(v) => (sub.alpha_bps, sub.min_stake, *v),
        _ => return Ok(()),
    };
    require_slash_dominance(&sub.staking_token, &sub.fee_token, alpha, min_stake, fee)
}

/// Same-mint slash-dominance gate (ADR-0029 decision 2). Where
/// `staking_token == fee_token` the `slash ≥ ratio·fee` comparison is unit-true
/// and IS enforced: `α·min_stake/10_000 · MIN_SLASH_FEE_RATIO ≥ fee_per_juror`.
/// `fee_per_juror == 0` bypasses (feeless pools unconstrained; `alpha_bps = 0`
/// stays legal only for them). Split-mint pools are explicitly NOT checked —
/// the units are incommensurable (the 2026-08-31 reverted cross-mint gate is
/// the recorded proof of unsoundness); that ratio is operator/governance
/// discipline, retunable through the 48h timelock.
pub(crate) fn require_slash_dominance(
    staking_token: &Pubkey,
    fee_token: &Pubkey,
    alpha_bps: u16,
    min_stake: u64,
    fee_per_juror: u64,
) -> Result<()> {
    if fee_per_juror == 0 || staking_token != fee_token {
        return Ok(());
    }
    let slash = (alpha_bps as u64)
        .checked_mul(min_stake)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(AccordError::ArithmeticOverflow)?;
    let max_fee = MIN_SLASH_FEE_RATIO
        .checked_mul(fee_per_juror)
        .ok_or(AccordError::ArithmeticOverflow)?;
    require!(slash >= max_fee, AccordError::FeeDominatesSlash);
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
    depth: u8,
    path: &[MSTNode],
    stored_root: &[u8; 32],
    stored_sum: u64,
) -> Result<([u8; 32], u64)> {
    // L-4 (security review 2026-09-23): the walk below consumes only the low
    // `path.len()` bits of `index`, so `index` and `index + 2^path.len()`
    // would authenticate identically. Pin the proof shape up front — a path
    // whose length ≠ the tree's depth, or an index outside `2^depth`, is a
    // malformed proof regardless of what the root comparison would say.
    let max_index = 1u64
        .checked_shl(u32::from(depth))
        .ok_or(AccordError::InvalidMerklePath)?;
    require!((index as u64) < max_index, AccordError::InvalidMerklePath);
    require!(path.len() == depth as usize, AccordError::InvalidMerklePath);
    // ponytail: 8 args are intrinsic to verify-then-recompute (old/new juror+stake,
    // position, depth, path, stored root+sum). A params struct is ceremony for one caller.
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
/// `depth` is the tree's fixed depth: the proof length and the index bound are
/// pinned against it up front (L-4, security review 2026-09-23).
pub(crate) fn verify_membership_and_prefix(
    leaf: &LeafClaim,
    index: u32,
    depth: u8,
    path: &[MSTNode],
    root_hash: &[u8; 32],
    root_sum: u64,
) -> Result<u64> {
    // L-4 (security review 2026-09-23): same proof-shape pin as
    // `verify_and_recompute` — index aliased beyond 2^depth would verify
    // identically to its low bits, so reject it up front.
    let max_index = 1u64
        .checked_shl(u32::from(depth))
        .ok_or(AccordError::InvalidMembershipProof)?;
    require!(
        (index as u64) < max_index,
        AccordError::InvalidMembershipProof
    );
    require!(
        path.len() == depth as usize,
        AccordError::InvalidMembershipProof
    );
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

// --- Raw remaining_accounts (de)serialization (ADR-0032) ----------------------

/// Deserialize a raw `remaining_accounts` entry as `T`. `remaining_accounts`
/// are plain `AccountInfo`s — Anchor neither auto-deserializes them on entry
/// nor auto-serializes them on exit — so this gives them the full Anchor
/// treatment (the 8-byte discriminator is checked by `try_deserialize`).
/// Owner + PDA re-derivation stay at the call sites (M-2 discipline).
pub(crate) fn read_account<T: AccountDeserialize>(info: &AccountInfo) -> Result<T> {
    let data = info.try_borrow_data()?;
    T::try_deserialize(&mut &data[..])
}

/// Deserialize a raw `remaining_accounts` entry as `T`, apply `f`, serialize
/// the whole account back — only when `f` succeeds (an error leaves the
/// account untouched). ADR-0032: auditability over CU; the full re-serialize
/// replaces the former targeted byte-offset field writes.
pub(crate) fn mutate_account<T, R>(
    info: &AccountInfo,
    f: impl FnOnce(&mut T) -> Result<R>,
) -> Result<R>
where
    T: AccountDeserialize + AccountSerialize,
{
    let mut data = info.try_borrow_mut_data()?;
    let mut acct = T::try_deserialize(&mut &data[..])?;
    let out = f(&mut acct)?;
    acct.try_serialize(&mut &mut data[..])?;
    Ok(out)
}

// --- Free-list neighbor helpers (accord-b5v5, doubly-linked RECLAIM-LEAF) ----

/// Read a free-list neighbor JurorStake passed as a raw `remaining_accounts`
/// entry, with full M-2 discipline: program ownership, discriminator, PDA
/// re-derivation from the account's own `juror` field, and
/// `tree_index == expected_index`. Returns `(juror, tree_index, next_free,
/// prev_free)` so the caller can check adjacency before unlinking.
pub(crate) fn read_free_list_neighbor(
    info: &AccountInfo,
    sub_key: &Pubkey,
    expected_index: u32,
) -> Result<(Pubkey, u32, u32, u32)> {
    require!(info.owner == &crate::ID, AccordError::FreeListHeadMismatch);
    let js: JurorStake =
        read_account(info).map_err(|_| error!(AccordError::FreeListHeadMismatch))?;
    require!(
        js.tree_index == expected_index,
        AccordError::FreeListHeadMismatch
    );
    let expected_pda = Pubkey::find_program_address(
        &[SEED_JUROR_STAKE, sub_key.as_ref(), js.juror.as_ref()],
        &crate::ID,
    )
    .0;
    require!(info.key == &expected_pda, AccordError::FreeListHeadMismatch);
    Ok((js.juror, js.tree_index, js.next_free, js.prev_free))
}

/// Mutate a free-list neighbor JurorStake passed as a raw `remaining_accounts`
/// entry (doubly-linked pointer maintenance — accord-b5v5). Full Anchor
/// (de)serialization via `mutate_account`; any malformed account surfaces as
/// `FreeListHeadMismatch`, matching the other free-list checks.
pub(crate) fn mutate_free_list_neighbor(
    info: &AccountInfo,
    set: impl FnOnce(&mut JurorStake),
) -> Result<()> {
    mutate_account::<JurorStake, _>(info, |js| {
        set(js);
        Ok(())
    })
    .map_err(|_| error!(AccordError::FreeListHeadMismatch))
}

/// ADR-0030 Failed-path bounty strip: credit each live appeal bond's
/// `reward` with one bounty unit and report the total credited, so the caller
/// can drain the same amount from `dispute.bounty_pool` before the filer
/// refund (per-source refunds — the filer's +1 rides the filer transfer,
/// each appellant's +1 rides their `claim_appeal_refund`). Verifies each PDA
/// against `["bond", dispute_key, i]`. On the Failed path no bond was ever
/// settled by `finalize_dispute`, so every bond of the dispute is live.
pub(crate) fn credit_bond_bounty_units<'info>(
    accounts: &'info [AccountInfo<'info>],
    dispute_key: &Pubkey,
    start: usize,
    n: usize,
    unit: u64,
) -> Result<u64> {
    if n == 0 {
        return Ok(0);
    }
    let mut credited: u64 = 0;
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
        mutate_account::<AppealBond, _>(bond_info, |bond| {
            bond.reward = bond
                .reward
                .checked_add(unit)
                .ok_or(AccordError::ArithmeticOverflow)?;
            Ok(())
        })?;
        credited = credited
            .checked_add(unit)
            .ok_or(AccordError::ArithmeticOverflow)?;
    }
    Ok(credited)
}

/// Release `active_draws` for every juror in every prior round
/// (`0..current_round`). Used by `cancel_dispute` and `redraw`'s exhaustion
/// branch (the Failed path). ADR-0033: no ruling exists on the Failed path,
/// so no coherence judgment is possible — and no fee is paid either (no
/// ruling, no pay). `dispute.fee_paid` is therefore never decremented before
/// settlement: the filer refund is exactly the filing-time fee, and appeal
/// bonds refund whole via `claim_appeal_refund` (the appeal fee's only
/// destination — the round's jurors — is unpaid).
///
/// Each round's `JurorStake` PDAs must follow the `Round` PDA in
/// `remaining_accounts`, laid out sequentially starting at `start`.
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

        let (jurors, _reveals): (Vec<Pubkey>, Vec<u64>) = {
            let loader = AccountLoader::<Round>::try_from(round_info)?;
            let round = loader.load()?;
            let count = round.juror_count as usize;
            (
                round.jurors[..count].to_vec(),
                round.reveals[..count].to_vec(),
            )
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
            mutate_account::<JurorStake, _>(acct_info, |js| {
                // ADR-0033: release only — no participation credit on the
                // Failed path (no ruling, no pay).
                js.active_draws = js.active_draws.saturating_sub(1);
                js.slash_reserve = js.slash_reserve.saturating_sub(slash_per_juror);
                Ok(())
            })?;
        }
        idx += count;
    }
    Ok(idx)
}

/// Shared per-round coherence settlement (CONCEPT-REVIEW Ugly 5 / accord-r6ti,
/// ADR-0020 two-mint rework; ADR-0029 finality-conditional fees).
///
/// Judges every drawn juror against `final_ruling` (NOT the round's own result),
/// slashes incoherent/non-revealing jurors by `α·min_stake`, and redistributes
/// two distinct pools:
/// - **stake pool** (`stake_token`): slash proceeds → written to `stake_delta`.
/// - **fee pool** (`fee_token`): the round's ENTIRE fee pot — every drawn
///   seat's base fee (round 0: the filer's `fee_paid` deposit; round r>0: the
///   appeal-fee portion of `AppealBond.amount`) + `pool_extra` (forfeited
///   no-flip bonds, final round only) → written to `fees_earned`. No fee is
///   credited before settlement (ADR-0029 supersedes the `finalize_round`
///   credit); incoherent revealers forfeit their base fee into the pot
///   (Kleros parity — the vindicated minority's "lone voice of reason" payoff).
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
/// Round 0's consumed pot is debited from `fee_paid` (which then holds only
/// the filer's refundable remainder — zero once round 0 settles, since nothing
/// decrements it before settlement).
///
/// All adjustments are ledger-only — no SPL transfers.
pub(crate) fn settle_round_accounts(
    round: &Round,
    terms: &CaseTerms,
    sub_key: &Pubkey,
    accounts: &[AccountInfo],
    final_ruling: u64,
    pool_extra: u64,
    fee_paid: &mut u64,
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
        let staked = read_account::<JurorStake>(acct)?.staked;
        if judge_coherent(round.reveals[i]) {
            coherent_count += 1;
        } else {
            slash_total = slash_total
                .checked_add(slash_per_juror.min(staked))
                .ok_or(AccordError::ArithmeticOverflow)?;
        }
    }

    // Fee pool (fee_token, ADR-0029): the round's ENTIRE pot — every drawn
    // seat's base `fee_per_juror` (round 0: the filer's filing deposit; round
    // r>0: the appeal-fee portion of the bond) + the forfeited no-flip bonds
    // (`pool_extra`, final round only). Non-revealer and incoherent-revealer
    // fees stay inside the pot for the coherent to split — nothing is paid
    // before settlement.
    let fee_pool = (panel as u64)
        .checked_mul(terms.fee_per_juror)
        .and_then(|v| v.checked_add(pool_extra))
        .ok_or(AccordError::ArithmeticOverflow)?;
    if round.round_idx == 0 && fee_pool > 0 {
        // Round-0 pot leaves the filer's refundable pool at consumption time
        // (ADR-0029: `fee_paid` is never decremented before settlement).
        *fee_paid = fee_paid
            .checked_sub(fee_pool)
            .ok_or(AccordError::ArithmeticOverflow)?;
    }

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
    for (i, acct_info) in accounts.iter().enumerate() {
        let is_coherent = judge_coherent(round.reveals[i]);

        // Slash every non-coherent juror (incoherent voter or no-show).
        // Reward eligibility: coherent normally; revealers as fallback when
        // no juror is coherent. Non-revealers are never rewarded.
        let is_reward_eligible = if coherent_count > 0 {
            is_coherent
        } else {
            round.reveals[i] != u64::MAX
        };

        mutate_account::<JurorStake, _>(acct_info, |js| {
            let slash_delta = if is_coherent {
                0i64
            } else {
                -(slash_per_juror.min(js.staked) as i64)
            };
            js.stake_delta =
                js.stake_delta
                    .saturating_add(slash_delta)
                    .saturating_add(if is_reward_eligible {
                        stake_share as i64
                    } else {
                        0
                    });
            if is_reward_eligible {
                js.fees_earned = js
                    .fees_earned
                    .checked_add(fee_share)
                    .ok_or(AccordError::ArithmeticOverflow)?;
            }
            js.active_draws = js.active_draws.saturating_sub(1);
            js.slash_reserve = js.slash_reserve.saturating_sub(slash_per_juror);
            Ok(())
        })?;
    }

    Ok(())
}
