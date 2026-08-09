# Accord — v1 Build Specification

> **Status:** specified (not yet built). The authoritative rationale lives in
> `apps/docs/docs/adr/0003`–`0012`; the domain language in `CONTEXT.md`. This file is the
> implementation reference: account model, instructions, state machine, economics.
> Code is authority on current state; this spec is authority on intent.

## Overview

`programs/accord` is a general-purpose, Schelling-point arbitration primitive on
Solana. It is **party-agnostic**: any Solana program (the _Arbitrable_) files a
question via CPI; the Accord draws stake-weighted Jurors, collects commit-reveal
votes, and writes a Ruling the filer reads lazily. It ships first as a standalone product.

Mechanism and economics are inherited from Kleros (live since 2019, 1000+ disputes);
the Solana-specific deviations are the draw (ADR-0012 — on-chain stake accumulator,
superseding ADR-0003/0008/0009's optimistic snapshot), the party model (ADR-0004),
Subaccord authority (ADR-0005), evidence (ADR-0006), and upgrade (ADR-0007).

## Account / PDA model

| Account         | Seeds                                    | Key fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Subaccord`     | `["subaccord", creator, risk_type_hash]` | `staking_token` (collateral mint, ADR-0002/0020), `fee_token` (compensation mint, ADR-0020), `min_stake`, `alpha_bps` (slash = `alpha_bps * min_stake / 10_000`), `review/commit/reveal_window`, `appeal_window` (per-Subaccord, ADR-0022; default `DEFAULT_APPEAL_WINDOW_SECS` = 3 days), `max_appeals` (the sole per-Subaccord panel-shape knob; round-1 size is the fixed `INITIAL_NUM_JURORS` = 3, ADR-0019), `aggregation: Aggregation` (v1 = `Plurality`; the dispute-kit tally rule, ADR-0019), `fee_per_juror` (in `fee_token`), `reveal_threshold_bps: u16` (reveal-quorum fraction, default 6_666 = 2/3, ADR-0021), `shortfall_policy: ShortfallPolicy` (v1 = `Redraw`, ADR-0021), `max_draw_attempts: u8` (same-size redraw cap per round, default 3, ADR-0021), `authority: Pubkey` (`default` ⇒ immutable), `evidence_operator: Pubkey`. `risk_type` + `evidence_spec` immutable. **Accumulator:** `root_hash: [u8;32]`, `total_stake: u64`, `next_index: u32`, `depth: u8` (fixed at creation, default 20 ≈ 1M seats). |
| `JurorStake`    | `["stake", subaccord, juror]`            | `staked: u64` (collateral), `fees_earned: u64` (compensation aggregate, ADR-0020), `active_draws: u32`, `tree_index: u32` (assigned at first stake, immutable), `stake_delta: i64` (pending slash/reward), `slash_reserve: u64`, `pending_withdrawal: u64`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Dispute`       | `["dispute", filer, nonce]`              | `subaccord`, `options: [..; MAX]`, `evidence_hashes: [[u8;32]; MAX_APPEALS+1]` (per-round; `[0]`=filing, appeal rounds optional, `[0u8;32]` sentinel=reuse prior, milestone accord-qp7c), `state`, `current_round`, `terms: CaseTerms` (filing-time freeze of economics + `aggregation` + `appeal_window`, ADR-0019/0022), `final_ruling: u8` (`u8::MAX` until `Final`), `fee_paid: u64` (running available fee pool, ADR-0020), `committed_vrf: Option<[u8;32]>`, `frozen_root: [u8;32]` (set in `commit_vrf_callback`), `frozen_total_stake: u64`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Round`         | `["round", dispute, round_idx]`          | `jurors: [Pubkey; MAX_JURORS]`, `commits: [[u8;32]; MAX_JURORS]`, `reveals`, `juror_count`, `result`, `draw_attempt: u32` (same-size redraw counter, orthogonal to `round_idx`; ADR-0021)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `PendingUpdate` | `["update", subaccord, nonce]`           | proposed field+value, `execute_after_slot` (48h timelock)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `stake_vault`   | Subaccord-PDA ATA of `staking_token`     | juror collateral (ADR-0020). Touched only by `stake`/`withdraw` + slash ledger.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `fee_vault`     | Subaccord-PDA ATA of `fee_token`         | filer fees + appeal bonds + reward pool (ADR-0020). Touched by `create_dispute`/`appeal`/`withdraw_fees`/`cancel_dispute`/`claim_appeal_refund`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

The `Snapshot` account, its bond, its 1-day challenge window, and the four fraud
predicates are **deleted** (ADR-0012): the juror-set root is canonical by
construction, maintained live by `stake`/`unstake`, so there is nothing to post,
challenge, or finalize.

`MAX` option count and `MAX_JURORS` (= 31, the 3rd-appeal panel) are compile-time
constants bounding account size.

## Instructions

| #   | Instruction                                               | Semantics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `create_subaccord(params, authority, evidence_operator)`  | permissionless; inits `Subaccord` (incl. empty accumulator: `root_hash = H(empty)`, `next_index = 0`, `depth` fixed at creation, default 20 ≈ 1M seats).                                                                                                                                                                                                                                                                                                                                         |
| 2   | `propose_subaccord_update` / `execute_subaccord_update`   | authority-signed; on-chain 48h timelock. No-op if `authority == default`. Stakers can unstake before execution.                                                                                                                                                                                                                                                                                                                                                                                  |
| 3   | `stake(amount, leaf_path)` / `unstake(amount, leaf_path)` | SPL transfer into/out of `stake_vault` (ADR-0020); caller supplies the juror's Merkle path, the chain verifies it vs the stored root, reads the **live** `JurorStake.staked`, applies the verified vault delta, and recomputes the root. O(log N). First stake appends a leaf and assigns `tree_index`; full unstake zeros the leaf (kept at zero selection weight). `unstake` reverts while `active_draws > 0`.                                                                                 |
| 4   | `create_dispute(subaccord, options, evidence_hash, fee)`  | **[Arbitrable CPI]** filer pays full fee. Reverts if active distinct stakers < required N. Does **not** freeze the root (capital stays live).                                                                                                                                                                                                                                                                                                                                                    |
| 5   | `request_vrf` / `commit_vrf_callback(randomness)`         | `request_vrf` CPIs the VRF oracle; the oracle's identity-constrained callback writes `committed_vrf` **and** freezes `dispute.frozen_root = subaccord.root`. One VRF + one frozen root serve the whole dispute (all appeal rounds draw a larger panel from the same fixed pool).                                                                                                                                                                                                                 |
| 6   | `draw_seat(dispute, seat_index, juror_membership)`        | consumes the **VRF**; **one seat per tx** (the 1232-byte packet cannot hold N proofs). Verifies MST membership + sortition (`prefix ≤ r_i < prefix + stake`, prefix from authenticated sibling sums) against `frozen_root`; inflation guard (`JurorStake.staked ≥ leaf.stake`); `active_draws += 1`. N txs make a panel; deterministic sampling without replacement (no `draw_attempt` grind).                                                                                                   |
| 7   | `commit(dispute, h)`                                      | `h = hash(vote, salt, juror_pubkey)`. One per drawn Juror.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 8   | `reveal(dispute, vote, salt)`                             | verifies `h`; records vote. Vote-recording only — no fee, no ATA, no SPL transfer (ADR-0020). Participation fee credited at `finalize_round`.                                                                                                                                                                                                                                                                                                                                                    |
| 9   | `appeal(dispute, new_evidence_hash)`                      | **permissionless**; pays `N_new · fee_per_juror` + bond (in `fee_token`); opens a new round at `2N+1`. Max 3 appeals. Draws from the same `frozen_root`. `new_evidence_hash: [u8;32]` stashes per-round evidence at `evidence_hashes[current_round+1]`; `[0u8;32]` sentinel = no new evidence (milestone accord-qp7c).                                                                                                                                                                           |
| 10  | `finalize_round` / `finalize_dispute`                     | permissionless crank. `finalize_round`: **reveal-quorum gate** (ADR-0021) — if `reveal_count ≥ ceil(panel × reveal_threshold_bps / 10_000)` tallies, credits `fees_earned += fee_per_juror` per revealer, decrements `fee_paid`, → `RoundResolved`; else → `RedrawEligible` (no credits). `finalize_dispute`: redistributes slash pool (`stake_delta`, stake_token) + fee pool (`fees_earned`, fee_token) to coherent jurors; decrements `active_draws`.                                         |
| 11  | `withdraw_fees`                                           | per-juror: pulls aggregate `fees_earned` from `fee_vault` → juror `fee_token` ATA. No `active_draws` gate, no timelock (ADR-0020).                                                                                                                                                                                                                                                                                                                                                               |
| 12  | `redraw(dispute)`                                         | **permissionless** (ADR-0021); only from `RedrawEligible`. Slashes no-shows into `stake_delta` (pending, not `staked`), releases the round's `active_draws` + `slash_reserve`, bumps `round.draw_attempt` (orthogonal to `round_idx` — same panel size, no appeal consumed), clears the round → `Created`. On `draw_attempt + 1 ≥ max_draw_attempts` → `Failed`: refunds filer `fee_paid`, releases prior rounds' `active_draws`; slashes stand, bonds stay claimable via `claim_appeal_refund`. |
| 13  | `get_ruling(dispute)`                                     | read-only — the Arbitrable reads `final_ruling` from the `Dispute` account.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 14  | `pause()` / `unpause()`                                   | multisig circuit-breaker (ADR-0007).                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

`post_snapshot`, `challenge_snapshot`, and `finalize_snapshot` are removed from
the instruction surface (ADR-0012).

## Dispute state machine

```
Created →(VRF committed, root frozen)→ Drawn → Review
   → Commit → Reveal → finalize_round
        ├─(quorum met)─→ RoundResolved →(appeal window, per-Subaccord terms.appeal_window)→ [Appeal: new round…] → Final → Closed
        └─(shortfall)──→ RedrawEligible → redraw
                             ├─(draw_attempt+1 < max_draw_attempts)─→ Created (fresh seats, draw_attempt++)
                             └─(exhausted)─────────────────────────→ Failed (filer fee refunded; slashes stand)
```

`draw_attempt` (ADR-0021) is orthogonal to `round_idx`: a shortfall redraw re-seeds
the sortition for fresh seats at the **same** panel size without consuming an
appeal. `(round_idx, draw_attempt)` salts the seed
`hash(committed_vrf ‖ dispute ‖ round_idx ‖ draw_attempt ‖ seat ‖ retry)`. A
permissionless crank advances states when their windows elapse (e.g. commit→reveal
after the commit window even if not all committed; reveal→resolved after the reveal
window). Odd Juror counts (3 / 7 / 15 / 31) make ties impossible.

## Economics (Kleros-inherited; ADR-0020 two-mint split)

- **Two mints:** `staking_token` (collateral — sortition weight + slash exposure) and `fee_token` (compensation — fees + appeal bonds, USDC by convention).
- **Fee:** filer pays `N · fee_per_juror` (round 1, in `fee_token`); appellant pays `N_new · fee_per_juror` + bond (in `fee_token`). Fees flow into the per-Subaccord `fee_vault`.
- **Fee credit:** `finalize_round` credits each revealer `fees_earned += fee_per_juror` and decrements `dispute.fee_paid` **only if the reveal-quorum threshold is met** (`reveal_count ≥ ceil(panel × reveal_threshold_bps / 10_000)`, ADR-0021). A shortfall credits nothing → the filer's single deposit suffices across the whole redraw ladder.
- **Slash:** each Incoherent Juror loses **`α · min_stake`** (flat, in `staking_token`) → written to `stake_delta`.
- **Redistribution (two pools):** slash pool (`stake_token`) → coherent `stake_delta`; fee pool = non-revealer fees + forfeited bonds (`fee_token`) → coherent `fees_earned`. Equal split (integer div; remainder is protocol surplus).
- **`withdraw_fees`:** per-juror, pulls aggregate `fees_earned` from `fee_vault`. No `active_draws` gate, no timelock.
- **Cross-round settlement:** every round is re-settled against the **final** Ruling (Kleros §4.6, ADR-0018).
- **Fund invariant:** `stake_vault.balance == Σ staked (± pending stake_delta)`; `fee_vault.balance == Σ dispute.fee_paid + Σ fees_earned + Σ AppealBond.amount`.

## Authority model

- **Subaccord:** `authority: Pubkey` (`default` ⇒ immutable; on-chain 48h timelock via propose/execute). `evidence_operator: Pubkey`.
- **Program upgrade:** Squads multisig → (post-sufficient-audit) `None` = frozen (ADR-0007).

## Evidence flow (ADR-0006)

```
claimant ──encrypt(evidence, evidence_operator_pubkey)──► encrypted blob ──► off-chain store
on-chain Accord: evidence_hash only
dispute filed + Jurors drawn (on-chain record)
   ▼
evidence_operator's open-source service: decrypt → re-encrypt per drawn Juror
   (+ optional per-Juror watermark → leak attribution) → deliver
   ▼
Juror decrypts, verifies cleartext vs on-chain evidence_hash
```

## Edge cases & defaults

- **Insufficient Jurors:** `create_dispute` / `appeal` **reverts** if the Subaccord's active distinct stakers < the required N. (Alt — under-fill — rejected: breaks the Schelling jury.)
- **Ties:** impossible (odd Juror counts).
- **No Coherent Jurors in a round:** the round's pool defaults to the winning option's favour (Kleros §4.6 fn.10). _Flag for revisit._
- **VRF availability:** `request_vrf` retries with backoff if the VRF result isn't yet available.
- **Stale/fabricated Merkle path** (stake/unstake/draw_seat): reverts — the path is verified against the stored/frozen root; the root cannot be corrupted by a bad path. Indexer liveness dependency only (recompute + retry), not a correctness risk.
- **Pool size:** bounded by the Subaccord's fixed `depth` (`2^depth`; default 20 ≈ 1M seats), plus rent economics (each `JurorStake` ≈ 0.0007 SOL, paid by the juror) and indexer capacity. Outgrowing a depth = new Subaccord or v2 migration.

## Out of scope (v2+)

Accord token · dynamic params · non-Plurality aggregation (IRV / median — ADR-0019) · stake-weighted Subaccord self-governance (ADR-0005 alt) · Arcium encrypted vote-tally (Juror vote privacy) · any on-chain evidence crypto beyond the trusted-operator hash model · validity proof (SNARK) that the accumulator root was built correctly (ADR-0012 future).

## References

- `apps/docs/docs/adr/0012` on-chain stake accumulator · `0004` party-agnostic · `0005` Subaccord authority · `0006` evidence · `0007` upgrade · `0020` two-mint/two-vault economics
- `apps/docs/docs/adr/0001` Schelling-over-hired-judges · `0002` per-Subaccord staking token (partially superseded by 0020)
- `CONTEXT.md` (domain language) · `PROJECT.md` (rationale) · `context/kleros-whitepaper.md` (prior art)
