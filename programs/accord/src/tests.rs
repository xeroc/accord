//! Host unit tests. The LiteSVM instruction suite lives in
//! `tests/` (bean accord-btel); this file pins the scoped VRF identity
//! and the MST accumulator math.

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
                verify_membership_and_prefix(&leaf, i as u32, depth, &path, &root, total).unwrap();
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
        assert!(verify_membership_and_prefix(&leaf0, 0, depth, &path0, &bad, total).is_err());

        // A tampered stake (overstates) does not authenticate — the root binds sums.
        let inflated = LeafClaim {
            juror: pk(2),
            stake: 9_999,
        };
        let (_, _, path1) = build_root_and_path(&leaves, depth, 1);
        assert!(verify_membership_and_prefix(&inflated, 1, depth, &path1, &root, total).is_err());
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
            &juror, old_stake, &juror, new_stake, target, depth, &path, &root, total,
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
            depth,
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
            depth,
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
                        verify_membership_and_prefix(&leaf, i as u32, depth, &path, &root, total)
                            .unwrap();
                    assert_eq!(got, prefix);
                    assert!(!found, "r_i matched more than one leaf");
                    found = true;
                }
                running += stake;
            }
            assert!(found, "seat {seat}: r_i={r_i} matched no leaf range");
        }
    }

    /// L-4 (security review 2026-09-23): the path walk consumes only the low
    /// `depth` bits of `index`, so `index` and `index + 2^depth` authenticate
    /// identically against the same path and root — pre-fix the aliased index
    /// VERIFIED. Pin the rejection: the verifiers bound `index < 2^depth` up
    /// front instead of trusting root inequality.
    #[test]
    fn aliased_index_beyond_tree_depth_is_rejected() {
        let leaves = vec![(pk(1), 100u64)];
        let (root, sum, path) = build_root_and_path(&leaves, 3, 0);
        // index 8 = 2^3: low 3 bits are 0, identical walk to index 0.
        assert!(
            verify_and_recompute(&pk(1), 100, &pk(1), 50, 8, 3, &path, &root, sum).is_err(),
            "verify_and_recompute: index >= 2^depth aliases (index & mask) and must be rejected"
        );
        let leaf = LeafClaim {
            juror: pk(1),
            stake: 100,
        };
        assert!(
            verify_membership_and_prefix(&leaf, 8, 3, &path, &root, sum).is_err(),
            "verify_membership_and_prefix: index >= 2^depth must be rejected"
        );
    }

    /// L-4 companion: the proof length must equal the tree depth — a short or
    /// long path is a malformed proof even before root comparison.
    #[test]
    fn path_length_must_equal_tree_depth() {
        let leaves = vec![(pk(1), 100u64), (pk(2), 200u64)];
        let (root, sum, path) = build_root_and_path(&leaves, 3, 0);
        let short: Vec<MSTNode> = path[..2].to_vec();
        assert!(
            verify_and_recompute(&pk(1), 100, &pk(1), 50, 0, 3, &short, &root, sum).is_err(),
            "a 2-level path against a depth-3 root must be rejected as malformed"
        );
    }
}
