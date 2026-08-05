---
# veridao-dsc2
title: Snapshot methods + MST helpers
status: completed
type: task
priority: normal
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-05T00:00:00Z
parent: veridao-gqzm
---

src/methods/snapshot.ts: post_snapshot, challenge_snapshot, finalize_snapshot. Plus CLIENT-SIDE MST helpers (ADR-0009): rebuild the Merkle-Sum Tree from the leaf set {juror, stake, cum_after} sorted by pubkey; produce inclusion proof + JurorMembership per selected slot r_i for draw. Unit-test the MST assembly independent of the chain. Acceptance: MST membership builder matches on-chain verify_mst_inclusion on a fixture. See ADR-0010.

## Summary of Changes

Implemented `packages/sdk/src/methods/snapshot.ts` — the three snapshot-trust instruction seams plus the Merkle-Sum Tree builder/prover/selector that back ADR-0009 stake-weighted sortition. Wired through the package entrypoint.

**MST (the core crypto).** Canonical builder matching the on-chain `verify_mst_inclusion` (lib.rs:1594-1634):

- `buildMst(jurors)` — sorts by juror pubkey ascending, computes `cum_after` running sums, pads to a perfect binary tree (next power of two) with zero-stake sentinel leaves whose pubkeys are strictly greater than every real juror (so real leaves stay contiguous + sorted; sentinel ranges are empty → never selected, do not affect the root sum). Computes every level's `{hash, sum}`.
- Leaf hash `sha256(juror ‖ stake_le ‖ cum_after_le)`; internal `sha256(left.hash ‖ right.hash)` with `sum = left.sum + right.sum` — bit-for-bit the on-chain scheme.
- `proveMembership(tree, index)` — `Vec<{sibling_hash, sibling_sum}>` walking rootward; index bits read LSB-first (matches lib.rs:1614).
- `selectSlot(tree, r_i)` — finds the leaf whose `[cum_before, cum_after)` contains the VRF slot.
- `buildMemberships(tree, slots[])` — `JurorMembership[]` ready for `draw`.
- `verifyMstInclusion(...)` — direct TS port of the on-chain verifier (independent code path) used to prove the builder+prover round-trip.

Hashing via the Web Crypto API (`globalThis.crypto.subtle`, zero-dep, Node ≥ 18 + browsers).

**Snapshot instructions (seam).** Same ADR-0010 facade pattern as dispute/voting: `postSnapshot` (commits `{root, total_stake}` + bond, lib.rs:485), `challengeSnapshot` (FraudProof, lib.rs:557), `finalizeSnapshot` (permissionless crank, lib.rs:743), plus `findSnapshotPda` (`["snapshot", dispute, round_idx.le_u4]`, state.rs:1915). Kit imported type-only; PDA lazy-imported.

**Verification.** `make lint` green; `pnpm --filter @veridao/sdk run build` emits `dist/methods/snapshot.{js,d.ts}`; `pnpm --filter @veridao/sdk run test` → **19/19** (7 snapshot + 7 voting + 5 dispute) via `node --test`. MST tests pin: (a) 2-leaf root to an independently computed known vector `c7ccca2d…3d48ae`; (b) build→prove→verify round-trip for every leaf across sizes 1..16; (c) tampered leaf / wrong root / swapped index rejected; (d) stake-weighted `selectSlot` ranges; (e) `buildMemberships` yields distinct verifying jurors.

**Dependency note.** Standalone seam per ADR-0010 — compiles + crypto/logic verifiable today. The `FraudProof` sum type for `challengeSnapshot` is typed as `unknown` here (its variants live in state.rs:323-366); a narrow typed wrapper is a natural follow-up when the appeal/challenge path (veridao-yny6) or the generated codecs land. Concrete client adapter + Surfpool e2e (test-matrix row 1: draw assembles correct memberships, panel VRF-determined) land with the foundation epic + jest suite (veridao-7iiv).
