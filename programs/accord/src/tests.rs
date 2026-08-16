//! Host unit tests. The LiteSVM instruction suite lives in
//! `tests/` (bean accord-btel); this file pins the manual layout offsets,
//! the scoped VRF identity, and the MST accumulator math.

#[cfg(test)]
mod layout_tests {
    use crate::constants::layout; // manual-offset pin — see `constants::layout`
    use crate::state::{AppealBond, JurorStake};
    use anchor_lang::prelude::*;
    use anchor_lang::AccountSerialize;

    /// The manual offset consts in `layout` must land exactly on the
    /// Borsh-serialized field bytes. This is the only TRUE layout pin (compile-
    /// time asserts can't verify Borsh field positions — see `layout`). A field
    /// reorder/resize that drifts the consts fails here.
    #[test]
    fn offsets_match_borsh() {
        // --- JurorStake: distinctive values at every offset we slice ---
        let js = JurorStake {
            subaccord: Pubkey::new_from_array([0xA0; 32]),
            juror: Pubkey::new_from_array([0xA1; 32]),
            staked: 0x0102_0304_0506_0708,
            active_draws: 0x090A_0B0C,
            bump: 0x0D,
            tree_index: 0x0E0F_1011,
            stake_delta: 0x1213_1415_1617_1819,
            slash_reserve: 0x1A1B_1C1D_1E1F_2021,
            withdraw_requested_at: 0x2223_2425_2627_2829,
            pending_withdrawal: 0x2A2B_2C2D_2E2F_3031,
            fees_earned: 0x3233_3435_3637_3839,
            next_free: 0x3A3B_3C3D,
        };
        let mut buf = Vec::new();
        js.try_serialize(&mut buf).unwrap();
        assert_eq!(
            &buf[layout::JS_STAKED_OFF..layout::JS_STAKED_OFF + 8],
            &js.staked.to_le_bytes()[..]
        );
        assert_eq!(
            &buf[layout::JS_ACTIVE_DRAWS_OFF..layout::JS_ACTIVE_DRAWS_OFF + 4],
            &js.active_draws.to_le_bytes()[..]
        );
        assert_eq!(
            &buf[layout::JS_STAKE_DELTA_OFF..layout::JS_STAKE_DELTA_OFF + 8],
            &js.stake_delta.to_le_bytes()[..]
        );
        assert_eq!(
            &buf[layout::JS_SLASH_RESERVE_OFF..layout::JS_SLASH_RESERVE_OFF + 8],
            &js.slash_reserve.to_le_bytes()[..]
        );
        assert_eq!(
            &buf[layout::JS_FEES_EARNED_OFF..layout::JS_FEES_EARNED_OFF + 8],
            &js.fees_earned.to_le_bytes()[..]
        );

        // --- AppealBond ---
        let ab = AppealBond {
            dispute: Pubkey::new_from_array([0xB0; 32]),
            round_idx: 0x0102_0304,
            appellant: Pubkey::new_from_array([0xB1; 32]),
            amount: 0x0506_0708_090A_0B0C,
            prior_result: 0x0D,
            bump: 0x0E,
        };
        let mut buf = Vec::new();
        ab.try_serialize(&mut buf).unwrap();
        assert_eq!(
            &buf[layout::AB_ROUND_IDX_OFF..layout::AB_ROUND_IDX_OFF + 4],
            &ab.round_idx.to_le_bytes()[..]
        );
        assert_eq!(
            &buf[layout::AB_AMOUNT_OFF..layout::AB_AMOUNT_OFF + 8],
            &ab.amount.to_le_bytes()[..]
        );
        assert_eq!(buf[layout::AB_PRIOR_OFF], ab.prior_result);
    }
}

#[cfg(test)]
mod vrf_identity_tests {
    /// ADR-0013: the callback validates the SCOPED per-program identity, not the
    /// deprecated global one. `request_vrf` issues a scoped request
    /// (`create_request_high_priority_scoped_randomness_ix`), so the oracle
    /// fulfills by signing with `scoped_vrf_identity(callback_program_id)`. This
    /// pins that the per-program PDA differs from the global
    /// `VRF_PROGRAM_IDENTITY` — the unit-level regression guard for the
    /// `CommitVrfCallback` `address =` constraint. The real oracle→callback path
    /// is never exercised in tests (they inject the VRF directly), so this delta
    /// is what catches a revert to the global constant.
    #[test]
    fn scoped_identity_differs_from_global() {
        let scoped = ephemeral_rollups_sdk::vrf::consts::scoped_vrf_identity(&crate::ID);
        let global = ephemeral_rollups_sdk::vrf::consts::VRF_PROGRAM_IDENTITY;
        assert_ne!(
            scoped, global,
            "scoped per-program identity must differ from the deprecated global constant"
        );
    }
}

// --- Tests (ADR-0012 accumulator MST math) -----------------------------------
//
// Pure unit tests for the subtree-sum accumulator helpers. These are the
// byte-exact reference the SDK MST builder must match: leaf = H(juror||stake),
// node = H(left_hash||left_sum||right_hash||right_sum). The full LiteSVM +
// Surfpool instruction suite is bean accord-btel; this is the self-check for
// the non-trivial on-chain math (verify_and_recompute + verify_membership_and_prefix
// + empty_tree_root).
#[cfg(test)]
mod accumulator_tests {
    use crate::state::{LeafClaim, MSTNode};
    use crate::utils::*;
    use anchor_lang::prelude::*;

    /// Deterministic test pubkey from a small integer.
    fn pk(n: u8) -> Pubkey {
        Pubkey::new_from_array([n; 32])
    }

    /// Build a depth-`depth` subtree-sum tree from `leaves` (index = position),
    /// padding the remaining 2^depth slots with zero leaves. Returns
    /// `(root_hash, root_sum, path_for(target))`.
    fn build_root_and_path(
        leaves: &[(Pubkey, u64)],
        depth: u8,
        target: u32,
    ) -> ([u8; 32], u64, Vec<MSTNode>) {
        let size = 1usize << depth;
        let mut hashes: Vec<[u8; 32]> = Vec::with_capacity(size);
        let mut sums: Vec<u64> = Vec::with_capacity(size);
        for i in 0..size {
            let (j, s) = if i < leaves.len() {
                leaves[i]
            } else {
                (Pubkey::default(), 0u64)
            };
            hashes.push(mst_leaf_hash(&j, s));
            sums.push(s);
        }
        let mut path = Vec::new();
        let mut idx = target as usize;
        for _ in 0..depth {
            let sib = if idx.is_multiple_of(2) {
                idx + 1
            } else {
                idx - 1
            };
            path.push(MSTNode {
                sibling_hash: hashes[sib],
                sibling_sum: sums[sib],
            });
            let mut nh = Vec::new();
            let mut ns = Vec::new();
            for k in (0..hashes.len()).step_by(2) {
                nh.push(mst_node_hash(
                    &hashes[k],
                    sums[k],
                    &hashes[k + 1],
                    sums[k + 1],
                ));
                ns.push(sums[k] + sums[k + 1]);
            }
            hashes = nh;
            sums = ns;
            idx /= 2;
        }
        assert_eq!(hashes.len(), 1, "depth fold yields a single root");
        (hashes[0], sums[0], path)
    }

    #[test]
    fn empty_root_matches_all_zero_tree() {
        for depth in [0u8, 1, 3, 8, 20] {
            let (root, sum, _) = build_root_and_path(&[], depth, 0);
            assert_eq!(root, empty_tree_root(depth), "depth {depth}");
            assert_eq!(sum, 0, "empty tree has zero total stake");
        }
    }

    #[test]
    fn membership_authenticates_and_prefix_is_correct() {
        // Three jurors with unequal stakes at depth 4 (16 slots).
        let leaves = vec![(pk(1), 1_000), (pk(2), 3_000), (pk(3), 500)];
        let depth = 4u8;
        let (root, total, _) = build_root_and_path(&leaves, depth, 0);
        assert_eq!(total, 4_500);

        // Each leaf verifies and its prefix is the running sum of earlier leaves.
        let mut running = 0u64;
        for (i, (_, stake)) in leaves.iter().enumerate() {
            let (_, _, path) = build_root_and_path(&leaves, depth, i as u32);
            let leaf = LeafClaim {
                juror: pk((i + 1) as u8),
                stake: *stake,
            };
            let prefix =
                verify_membership_and_prefix(&leaf, i as u32, &path, &root, total).unwrap();
            assert_eq!(prefix, running, "prefix for leaf {i}");
            running += stake;
        }

        // A wrong root is rejected.
        let bad = [0u8; 32];
        let leaf0 = LeafClaim {
            juror: pk(1),
            stake: 1_000,
        };
        let (_, _, path0) = build_root_and_path(&leaves, depth, 0);
        assert!(verify_membership_and_prefix(&leaf0, 0, &path0, &bad, total).is_err());

        // A tampered stake (overstates) does not authenticate — the root binds sums.
        let inflated = LeafClaim {
            juror: pk(2),
            stake: 9_999,
        };
        let (_, _, path1) = build_root_and_path(&leaves, depth, 1);
        assert!(verify_membership_and_prefix(&inflated, 1, &path1, &root, total).is_err());
    }

    #[test]
    fn verify_and_recompute_matches_rebuild() {
        let leaves = vec![(pk(1), 1_000), (pk(2), 3_000), (pk(3), 500), (pk(4), 2_000)];
        let depth = 5u8;
        let (root, total, _) = build_root_and_path(&leaves, depth, 0);

        // Top up juror at index 2: stake 500 -> 1_500.
        let target = 2u32;
        let old_stake = 500u64;
        let new_stake = 1_500u64;
        let juror = pk(3);
        let (_, _, path) = build_root_and_path(&leaves, depth, target);
        let (new_root, new_total) = verify_and_recompute(
            &juror, old_stake, &juror, new_stake, target, &path, &root, total,
        )
        .expect("valid path authenticates + recomputes");
        assert_eq!(new_total, total - old_stake + new_stake);

        // Rebuild from scratch with the new stake: roots must match exactly.
        let mut rebuilt = leaves.clone();
        rebuilt[target as usize] = (juror, new_stake);
        let (rebuilt_root, rebuilt_total, _) = build_root_and_path(&rebuilt, depth, target);
        assert_eq!(new_root, rebuilt_root, "recomputed root matches rebuild");
        assert_eq!(new_total, rebuilt_total);

        // A stale/wrong path is rejected and does not yield a root.
        let wrong_path = build_root_and_path(&leaves, depth, 0).2; // path for index 0, not 2
        assert!(verify_and_recompute(
            &juror,
            old_stake,
            &juror,
            new_stake,
            target,
            &wrong_path,
            &root,
            total
        )
        .is_err());
    }

    #[test]
    fn first_stake_transitions_zero_leaf_to_juror() {
        // Simulate a juror's first stake: the assigned slot holds the all-zero
        // leaf (default juror, 0 stake); after staking it becomes (juror, stake).
        let depth = 4u8;
        let (root0, total0, _) = build_root_and_path(&[], depth, 0); // empty tree
        assert_eq!(root0, empty_tree_root(depth));

        let juror = pk(7);
        let stake = 2_500u64;
        let target = 0u32;
        let (_, _, path) = build_root_and_path(&[], depth, target);
        let (new_root, new_total) = verify_and_recompute(
            &Pubkey::default(),
            0,
            &juror,
            stake,
            target,
            &path,
            &root0,
            total0,
        )
        .expect("zero-slot path authenticates + recomputes to the juror leaf");

        // Rebuild with the juror at index 0 must match.
        let (rebuilt_root, rebuilt_total, _) =
            build_root_and_path(&[(juror, stake)], depth, target);
        assert_eq!(new_root, rebuilt_root);
        assert_eq!(new_total, rebuilt_total);
        assert_eq!(new_total, stake);
    }

    #[test]
    fn sortition_prefix_brackets_vrf_seat() {
        // For every seat value (at retry 0), the deterministic r_i must fall
        // into exactly one leaf's [prefix, prefix+stake) range — proving
        // sortition is total and non-overlapping for the reconstructed prefixes.
        let leaves = vec![(pk(1), 1_000), (pk(2), 3_000), (pk(3), 500), (pk(4), 2_000)];
        let depth = 4u8;
        let (root, total, _) = build_root_and_path(&leaves, depth, 0);
        let vrf = [99u8; 32];
        let dispute_key = pk(42);
        let round_idx = 0u32;
        let vrf_seed =
            solana_program::hash::hashv(&[&vrf, dispute_key.as_ref(), &round_idx.to_le_bytes()])
                .to_bytes();

        for seat in 0..4u32 {
            let retry = 0u32;
            let r = solana_program::hash::hashv(&[
                &vrf_seed,
                &seat.to_le_bytes(),
                &retry.to_le_bytes(),
            ])
            .to_bytes();
            let r_i = u64::from_le_bytes(r[0..8].try_into().unwrap()) % total;
            let mut found = false;
            let mut running = 0u64;
            for (i, (_, stake)) in leaves.iter().enumerate() {
                let prefix = running;
                if r_i >= prefix && r_i - prefix < *stake {
                    // This leaf wins seat `seat`; verify the on-chain prefix fn agrees.
                    let (_, _, path) = build_root_and_path(&leaves, depth, i as u32);
                    let leaf = LeafClaim {
                        juror: pk((i + 1) as u8),
                        stake: *stake,
                    };
                    let got =
                        verify_membership_and_prefix(&leaf, i as u32, &path, &root, total).unwrap();
                    assert_eq!(got, prefix);
                    assert!(!found, "r_i matched more than one leaf");
                    found = true;
                }
                running += stake;
            }
            assert!(found, "seat {seat}: r_i={r_i} matched no leaf range");
        }
    }
}
