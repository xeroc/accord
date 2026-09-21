---
# accord-3j58
title: Finality-conditional juror fees + same-mint slash-dominance gate (ADR-0029)
status: todo
type: feature
priority: high
tags:
    - program
    - economics
created_at: 2026-08-31T17:45:36Z
updated_at: 2026-08-31T17:45:36Z
---

## Context — why this exists

2026-08-31 appeal-economics audit finding: Accord is the only studied court (Kleros v1/v2, Aragon, UMA) that pays jurors **before** the final ruling exists. `finalize_round` credits every revealer `fees_earned += fee_per_juror` at round resolution, outcome-independent, never clawed back (ADR-0018 §1 as amended by ADR-0020). That unconditional fee is the only guaranteed payout for an incoherent vote, and it forces a cross-mint invariant (`α·min_stake ≥ 2·fee_per_juror`) that is **unsound to check on-chain** (stake_token units vs fee_token units — different decimals, drifting value; a hard gate was implemented and reverted same-day, 2026-08-31). Authority: **ADR-0029** (read it first — `apps/docs/adr/accord/0029-finality-conditional-juror-fees-same-mint-slash-dominance.md`).

Two coupled decisions implement ADR-0029:

1. **(3a) Finality-conditional fees** — move the fee credit from `finalize_round` to settlement; fees are paid only to jurors coherent with the FINAL ruling (incoherent revealers forfeit their base fee into the round's coherent pot — Kleros-exact).
2. **(3b) Same-mint slash-dominance guard** — where `staking_token == fee_token`, enforce `α·min_stake ≥ MIN_SLASH_FEE_RATIO·fee_per_juror` at creation + both update gates; split-mint pools are explicitly NOT numerically checked (operator discipline, docs guidance).

## Design decisions (from ADR-0029 + 2026-08-31 grilling)

### D1 — `finalize_round`: credit removal

- Delete the `fees_earned` credit block (`programs/accord/src/instructions/finalize_round.rs:118-157`) and the round-0 `dispute.fee_paid` decrement (`:165-170`).
- Tally/quorum/tie/decisiveness semantics unchanged (ADR-0021/0026). State transitions unchanged.
- `remaining_accounts` juror-stake list is no longer needed by this instruction → drop it from the account context (IDL change → codegen + facade + cranker + CLI + e2e).
- `dispute.fee_paid` becomes purely "round-0 fee pot, refundable on Failed/cancel, consumed only at round-0 settlement". Filer refunds on cancel/redraw-exhaustion become trivially exact (no mid-flight decrement).

### D2 — settlement distributes the whole round fee pot

`settle_round_accounts` (`utils.rs`), for every round (prior rounds via `settle_round`, final round via `finalize_dispute`):

- Round fee pot = `panel · fee_per_juror` (round 0: from filer's `fee_paid`; round r>0: the appeal-fee portion of `AppealBond.amount`) **+ non-revealer fees (already inside the pot) + `pool_extra`** (final round only: forfeited no-flip bonds).
- Coherent-with-`final_ruling` jurors split the whole pot: `pot / coherent_count` each (integer div, remainder = protocol surplus). Full-coherent panel ⇒ each gets exactly their base fee. Vindicated minority ⇒ whole pot to it (base fees of the overturned majority included) — the "lone voice of reason" payoff, now fee-side too.
- Incoherent revealer: nothing (base fee forfeited into the pot). Same slash as today (`α·min_stake` → `stake_delta`).
- No-coherent-but-revealed fallback (accord-aqmw): revealers split the whole pot (unchanged rule, bigger pot). Zero reveals: pot traps (accord-31xw interaction — unchanged).
- Round-0 `fee_paid` decrements by the consumed pot at settlement (not before).
- `claim_appeal_refund` is already forward-compatible (refunds `amount − fee`, fee re-derived on-chain; under 0029 that fee has a real destination at settlement). Verify, don't change.

### D3 — Failed-dispute path preserves participation pay

No final ruling exists on Failed (redraw exhaustion / cancel), so no coherence judgment is possible: each **resolved** round's revealers are credited their base `fee_per_juror` (participation only), filer refunded remaining `fee_paid`, bonds claimable as today. Same net economics as the current code, no new claim machinery. Implement in `redraw` (exhaustion branch) + `cancel_dispute` (post-draw branch).

### D4 — same-mint dominance gate

- `constants.rs`: `MIN_SLASH_FEE_RATIO: u64 = 2` (ratio 2 = margin over the post-0029 theoretical bound of 1; coherent-pool shares are endogenous and widen the lucky-noise edge).
- `utils.rs`: `require_slash_dominance(alpha_bps, min_stake, fee_per_juror)` — `slash = α·min_stake/10_000` (checked ops), require `slash.saturating_mul(MIN_SLASH_FEE_RATIO) ≥ fee_per_juror`, error `FeeDominatesSlash` (append to `AccordError` — preserve ordinal stability of existing codes).
- Gated on `sub.staking_token == sub.fee_token` (same-mint only). `fee_per_juror == 0` bypasses (feeless pools unconstrained; `alpha_bps = 0` stays legal only for them).
- Call sites: `create_subaccord` (after the fee-overflow bound) + `validate_update_cross_field` arms for `AlphaBps`/`MinStake`/`FeePerJuror` (compose the updated leg with live values; propose + execute both already call it).

### Vault-ledger invariant (unchanged form, new meaning)

`fee_vault.balance == Σ dispute.fee_paid + Σ JurorStake.fees_earned + Σ AppealBond.amount` still holds by construction: un-settled round pots live inside `fee_paid` / `AppealBond.amount` until settlement consumes them. Update `assert_fund_invariants` comments/tests accordingly.

## Leaf tasks (TDD — RED first, each)

- [ ] **L1 RED/GREEN: finalize_round credits nothing.** LiteSVM: after a quorum-met round resolution, all revealers' `fees_earned == 0` and `dispute.fee_paid` unchanged; state still `RoundResolved`. Then delete the credit block + shrink accounts.
- [ ] **L2 RED/GREEN: settlement distributes the whole pot.** LiteSVM cases: (a) all-reveal all-coherent → each `fees_earned == fee_per_juror`; (b) 2-of-3 coherent → each gets `3·fee/2` (includes the incoherent revealer's forfeited base), incoherent revealer `fees_earned` unchanged (0 credit, slash stands); (c) A→B flip, round-0 lone coherent juror gets the whole round-0 pot; (d) no-coherent → revealers split whole pot; (e) final round via `finalize_dispute` includes forfeited bonds in the pot (update appeal.spec expectations: fee_share = (7·fee + forfeit)/coherent, base fee NOT pre-paid).
- [ ] **L3 RED/GREEN: Failed path pays resolved-round participation.** quorum-redraw exhaustion + cancel_dispute post-draw: resolved rounds' revealers bank base fee; filer refund = full remaining `fee_paid`; appeal bonds still claimable (bond-only).
- [ ] **L4 RED/GREEN: same-mint dominance gate.** create rejects `fee_per_juror: 51` at slash 100, accepts 50 (knife edge) and 0; propose/execute reject `FeePerJuror(1_000_000)`, `MinStake(10)`, `AlphaBps(0)`-with-fee; accept `FeePerJuror(0)` under any α; **split-mint pool (staking_token ≠ fee_token) accepts fee-dominated config** (the gate must NOT fire cross-mint).
- [ ] **L5 Change coupling.** `anchor build --ignore-keys` → `make codegen` → SDK facades (`finalizeRound` accounts, settlement fetchers), cranker + CLI call sites, all fee assertions in `tests/src/*.spec.ts` (accumulator, staking, reclaim, dispute, evidence, scalar, appeal, quorum-redraw, full-lifecycle, synod fixtures economics where `frozenFee` math unchanged but assertions move). Whole workspace `pnpm -r run build` green.
- [ ] **L6 e2e green rule.** Full `make test` green (Rust unit + LiteSVM + jest/Surfpool), incl. new/extended specs for L1–L4.
- [ ] **L7 qedspec + formal_verification.** `accord.qedspec`: settlement handlers gain the fee-pot distribution + fee-conservation invariant; regenerate `formal_verification/`.
- [ ] **L8 docs.** SPEC.md (finalize_round/settlement/economics sections), CONTEXT.md fee terms, trust-profile note, ADR-0018 status banner → "Partially superseded (§1, by 0029)", ADR-0020 cross-note, AGENTS "Gotchas" fee line if stale, `.agents/skills/useaccord/` flag/command examples touched by the finalize_round account change. Grep `fees_earned`/`fee credit` across the docs surface.

## Acceptance

- `make test` fully green (the green rule — no skips on the Surfpool lane).
- No fee is creditable anywhere before the dispute is terminal (`Final` or `Failed`) — provable from the instruction graph.
- Same-mint gate live at create + propose + execute; split-mint explicitly un-gated (tested).
- Every doc/ADR/bean touched by the rename-level coupling updated in the same change.

## Non-goals

- Appellant flip-bounty / "lone successful appellant" reward — DECIDED as ADR-0030 / bean accord-82yf (blocked by this bean; do not start in parallel — it rides this bean's finality-time fee plumbing).
- Kleros-style appeal crowdfunding.
- Canon/Synod program changes (filing fee amount unchanged).
