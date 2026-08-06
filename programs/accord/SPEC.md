# Accord — v1 Build Specification

> **Status:** specified (not yet built). The authoritative rationale lives in
> `apps/docs/docs/adr/0003`–`0009`; the domain language in `CONTEXT.md`. This file is the
> implementation reference: account model, instructions, state machine, economics.
> Code is authority on current state; this spec is authority on intent.

## Overview

`programs/accord` is a general-purpose, Schelling-point arbitration primitive on
Solana. It is **party-agnostic**: any Solana program (the _Arbitrable_) files a
question via CPI; the Accord draws stake-weighted Jurors, collects commit-reveal
votes, and writes a Ruling the filer reads lazily. It ships first as a standalone product.

Mechanism and economics are inherited from Kleros (live since 2019, 1000+ disputes);
the Solana-specific deviations are the draw (ADR-0003), the party model (ADR-0004),
Subaccord authority (ADR-0005), evidence (ADR-0006), and upgrade (ADR-0007).

## Account / PDA model

| Account         | Seeds                                    | Key fields                                                                                                                                                                                                                                            |
| --------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Subaccord`     | `["subaccord", creator, risk_type_hash]` | `staking_token` (mint), `min_stake`, `alpha_bps`, `initial_num_jurors` (round-1 seed; appeals grow 2N+1 — ADR-0014), `review/commit/reveal_window`, `max_appeals`, `fee_per_juror`, `aggregation` (`Aggregation` enum; v1 `Plurality` — ADR-0014), `authority: Pubkey` (`default` ⇒ immutable), `evidence_operator: Pubkey`. `risk_type` + `evidence_spec` immutable. Appeal panel = 2N+1 per round; ladder bounded by `MAX_JURORS` (=31) — `create_subaccord` rejects `(initial_num_jurors, max_appeals)` whose final panel exceeds `MAX_JURORS`, and requires odd `initial_num_jurors` (default 3). |
| `JurorStake`    | `["stake", subaccord, juror]`            | `amount: u64`, `active_draws: u32`                                                                                                                                                                                                                    |
| `Dispute`       | `["dispute", filer, nonce]`              | `subaccord`, `options: [..; MAX]`, `evidence_hash: [u8;32]`, `state`, `current_round`, `final_ruling: Option<u8>`                                                                                                                                     |
| `Round`         | `["round", dispute, round_idx]`          | `jurors: [Pubkey; MAX_JURORS]`, `commits: [[u8;32]; MAX_JURORS]`, `reveals`, `juror_count`, `result`                                                                                                                                                  |
| `Snapshot`      | `["snapshot", dispute, round_idx]`       | `merkle_root: [u8;32]`, `poster: Pubkey`, `bond`, `challenge_deadline`, `status`                                                                                                                                                                      |
| `PendingUpdate` | `["update", subaccord, nonce]`           | proposed field+value, `execute_after_slot` (48h timelock)                                                                                                                                                                                             |
| token vaults    | Subaccord-PDA-owned SPL accounts         | stake pool + fee pool                                                                                                                                                                                                                                 |

`MAX` option count and `MAX_JURORS` (= 31, the 3rd-appeal panel) are compile-time
constants bounding account size.

## Instructions

| #   | Instruction                                              | Semantics                                                                                                                                                                                |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `create_subaccord(params, authority, evidence_operator)` | permissionless; inits `Subaccord`.                                                                                                                                                       |
| 2   | `propose_subaccord_update` / `execute_subaccord_update`  | authority-signed; on-chain 48h timelock. No-op if `authority == default`. Stakers can unstake before execution.                                                                          |
| 3   | `stake(amount)` / `unstake(amount)`                      | SPL transfer into/out of the Subaccord vault. `unstake` reverts while `active_draws > 0`.                                                                                                |
| 4   | `create_dispute(subaccord, options, evidence_hash, fee)` | **[Arbitrable CPI]** filer pays full fee. Reverts if active distinct stakers < required N.                                                                                               |
| 5   | `post_snapshot(dispute, merkle_root)`                    | off-chain indexer posts root; bonds **1× max-appeal-fee**.                                                                                                                               |
| 6   | `challenge_snapshot(dispute, fraud_proof)`               | within 1-day window; challenger bonds equal. Wrong root ⇒ poster's bond to challenger, root voided. False challenge ⇒ challenger's bond to poster.                                       |
| 7   | `draw(dispute, vrf_result, juror_memberships[])`         | consumes **VRF**; selects **N distinct** Jurors via cumulative-stake lookup over the finalized root; verifies Merkle membership+weight; `active_draws += 1` per drawn Juror. |
| 8   | `commit(dispute, h)`                                     | `h = hash(vote, salt, juror_pubkey)`. One per drawn Juror.                                                                                                                               |
| 9   | `reveal(dispute, vote, salt)`                            | verifies `h`; records vote.                                                                                                                                                              |
| 10  | `appeal(dispute)`                                        | **permissionless**; pays `N_new · fee_per_juror` + bond; opens a new round at `2N+1`. Max 3 appeals.                                                                                     |
| 11  | `finalize_round` / `finalize_dispute`                    | permissionless crank (advances on window expiry). Tallies, sets round result; on the final round redistributes and decrements `active_draws`.                                            |
| 12  | `get_ruling(dispute)`                                    | read-only — the Arbitrable reads `final_ruling` from the `Dispute` account.                                                                                                              |
| 13  | `pause()` / `unpause()`                                  | multisig circuit-breaker (ADR-0007).                                                                                                                                                     |

## Dispute state machine

```
Created → SnapshotPosted →(1-day challenge window)→ Drawn → Review
   → Commit → Reveal → RoundResolved →(appeal window)→ [Appeal: new round…]
   → Final → Closed
```

A permissionless crank advances states when their windows elapse (e.g. commit→reveal
after the commit window even if not all committed; reveal→resolved after the reveal
window). Odd Juror counts (3 / 7 / 15 / 31) make ties impossible.

## Economics (Kleros-inherited; weight = 1 for distinct Jurors)

- **Fee:** filer pays `N · fee_per_juror` (round 1); appellant pays `N_new · fee_per_juror` + bond.
- **Slash:** each Incoherent Juror loses **`α · min_stake`** (flat — see ADR-0003 consequence).
- **Redistribution:** forfeited fees + slashed stake → Coherent Jurors, **equal split**.
- **Non-reveal penalty:** ≥ the Incoherent penalty (forces reveal; Kleros §4.6).
- **Appeal bond:** forfeited → Coherent Jurors of the **final** round if the appeal does not _flip_ the prior Ruling; returned if it flips.
- **Cross-round settlement:** every round is re-settled against the **final** Ruling (Kleros §4.6).

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
- **VRF availability:** `draw` retries with backoff if the VRF result isn't yet available.

## Out of scope (v2+)

Accord token · dynamic params · non-Plurality aggregation (IRV / median — ADR-0014) · stake-weighted Subaccord self-governance (ADR-0005 alt) · Arcium encrypted vote-tally (Juror vote privacy) · any on-chain evidence crypto beyond the trusted-operator hash model.

## References

- `apps/docs/docs/adr/0003` draw · `0004` party-agnostic · `0005` Subaccord authority · `0006` evidence · `0007` upgrade · `0008` snapshot trust · `0009` sortition
- `apps/docs/docs/adr/0001` Schelling-over-hired-judges · `0002` per-Subaccord staking token (no token v1)
- `CONTEXT.md` (domain language) · `PROJECT.md` (rationale) · `context/kleros-whitepaper.md` (prior art)
