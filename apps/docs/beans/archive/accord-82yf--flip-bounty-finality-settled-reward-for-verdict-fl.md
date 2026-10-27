---
# accord-82yf
title: Flip-bounty — finality-settled reward for verdict-flipping appellants (ADR-0030)
status: completed
type: feature
priority: high
tags:
    - program
    - economics
created_at: 2026-08-31T17:56:09Z
updated_at: 2026-09-22T11:05:00Z
blocked_by:
    - accord-3j58
---

## Context — why this exists

2026-08-31 appeal-economics audit, verdict-2 gap: a successful (ruling-flipping) appellant recovers only the bond — net cost `N_new · fee_per_juror` even when right. No on-chain reward for correcting a wrong ruling exists; the worst case is the **lone successful appeal** (no later failed appeals ⇒ no forfeit pot ⇒ nothing for any forfeit-routing to pay from). Owner directive: Accord must be **inherently consistent** — no reliance on the Arbitrable layer for appeal incentives; Kleros-style crowdfunding deferred. Authority: **ADR-0030** (read first — `apps/docs/adr/accord/0030-flip-bounty-finality-settled-appellant-reward.md`). **Blocked by `accord-3j58`** (ADR-0029): the bounty rides on finality-time fee disposition — do not start before 3j58 lands.

## Design decisions (from ADR-0030 + 2026-08-31 grilling)

### D1 — bounty pool funding: `+1 · fee_per_juror` at creation and at every appeal

- `create_dispute`: filer tenders `(min_jury_size + 1) · fee_per_juror`; the +1 banks into a new `Dispute.bounty_pool: u64` (ledger only; tokens in the shared `fee_vault`). `FeeMismatch` check becomes `(min_jury_size + 1) · fee_per_juror`.
- `appeal`: appellant tenders `(N_new + 1) · fee_per_juror` (fee) + `N_new · fee_per_juror` (bond, unchanged); the +1 joins `bounty_pool`.
- `AppealBond.amount` semantics UNCHANGED (`fee + bond` at N·fpj each) ⇒ `claim_appeal_refund`'s `amount − panel·fpj` refund math is untouched; the bounty is a separate column (`AppealBond.reward: u64`, zero-init).
- Pool size at finality is deterministic: `(1 + appeal_count) · fpj`. No per-contributor tracking for Final outcomes.
- Space: `Dispute.bounty_pool` (u64) + `AppealBond.reward` (u64) — prefer the existing 64-byte padding reserve (accord-8k60); pre-mainnet space bump acceptable otherwise. Update `constants::layout` offsets + `layout_tests::offsets_match_borsh`.

### D2 — disposition at finalization (ledger decisions at `finalize_dispute`; payouts lazy)

| Terminal outcome | Bounty pool disposition |
|---|---|
| Final, no appeal ever | stays on `dispute.bounty_pool` → refundable to the filer via new permissionless `claim_filing_bounty` |
| Final, ≥1 flip | split equally among **aligned flippers**, written to `AppealBond.reward` at finalize; claimed as a top-up in `claim_appeal_refund`; `bounty_pool → 0` |
| Final, appeals but no flip | rolled into `pool_extra` at finalize → final round's coherent-juror pool (joins forfeited bonds); `bounty_pool → 0` |
| Failed (redraw exhaustion / cancel) | filer's +1 rides the existing filer refund transfer (`fee_paid` + `bounty_pool`, then zero); each appellant's +1 rides `claim_appeal_refund` (bond + 1·fpj derived, idempotent zero-on-claim) |

### D3 — aligned-flipper rule (appeal coherence vs the final ruling)

An appeal is an aligned flipper iff `bond.prior_result ≠ dispute.final_ruling` AND `round[bond.round_idx].result == dispute.final_ruling`. Implementation at `finalize_dispute`: the bond pass (already iterating `AppealBond`s for no-flip forfeiture) additionally reads the round result of `bond.round_idx` (Round PDA is in the remaining set on the Failed layout only — for Final the prior `Round`s must be added to `finalize_dispute`'s account set; flag the account-list growth against the 1232-byte budget — worst case 3 appeals + 31 jurors + 3 bonds + 3 prior rounds, verify fit, else read results via a second crank and store a per-round `flipped_to` u64 on `Round` at `finalize_round` time as fallback).

- Equal shares across aligned bonds: `reward = bounty_pool / aligned_count` (integer div; remainder → `pool_extra`).
- Defensive fallback (unreachable by the ADR-0030 non-emptiness argument): zero aligned bonds with a flip recorded → pool → `pool_extra`.
- A→B→A case: only the appellant whose round result == final gets paid; the overturned flipper forfeits their +1 into the pool (shares computed after summing all +1s).

### D4 — vault-ledger invariant extension

`fee_vault.balance == Σ dispute.fee_paid + Σ JurorStake.fees_earned + Σ AppealBond.amount + Σ dispute.bounty_pool` — extend `assert_fund_invariants` in the test harness (and the ADR-0020 doc note).

### D5 — Arbitrable coupling (required, unlike 3j58)

- **Canon**: `challenge_item`'s CPI tender grows by `fee_per_juror` (fee sizing + error msg); Canon e2e/fixture updates.
- **Synod**: `frozenFee = minJurySize · feePerJuror` becomes `(minJurySize + 1) · feePerJuror`; pot math `N·S − fee`, `synodEconomics` fixtures, known-answer vectors in `synod.fixtures.spec.ts` all move; Synod e2e updates.

## Leaf tasks (TDD — RED first, each)

- [ ] **L1 RED/GREEN: pool funding.** LiteSVM: `create_dispute` tenders J+1 units (FeeMismatch on J), `bounty_pool == fpj`; `appeal` tenders `(2N+1)·fpj`, `bounty_pool` grows by fpj, `AppealBond.amount` still `fee+bond` at N·fpj each. Layout offsets + borsh test.
- [ ] **L2 RED/GREEN: Final disposition — no appeal.** Finalize with `current_round == 0`: `bounty_pool` intact; `claim_filing_bounty` pays filer +fpj, idempotent (second claim reverts).
- [ ] **L3 RED/GREEN: Final disposition — flips.** (a) Lone flip: aligned bond gets `reward == 2·fpj` (filer +1 + own +1), claim pays bond + reward, idempotent; (b) A→B→A: only the final-aligned appellant rewarded, first flipper's +1 included in the share, first flipper claim returns bond only; (c) flip + later failed appeal: aligned share includes the failed appeal's +1 (and its forfeited bond stays with `pool_extra` as today).
- [ ] **L4 RED/GREEN: Final disposition — no flip.** Appeals happened, final == round-0 result: pool joins `pool_extra`; final coherent jurors' `fees_earned` assertions updated; appellant claim returns bond only.
- [ ] **L5 RED/GREEN: Failed path.** Redraw exhaustion + cancel: filer refund == `fee_paid + bounty_pool`; each appellant's `claim_appeal_refund` == bond + 1·fpj; idempotent.
- [ ] **L6 Account-budget check.** `finalize_dispute` with prior `Round`s in the account set at worst case (3 appeals, panels 3/7/15/31, 3 bonds, 3 prior rounds + final panel 31): verify ≤ tx limits; implement the `Round.flipped_to` fallback crank if not.
- [ ] **L7 Change coupling.** `anchor build --ignore-keys` → `make codegen` → SDK facades (`createDispute` fee math, `appeal` cost fn, `claimAppealRefund` + `claimFilingBounty`), cranker + CLI commands, `.agents/skills/useaccord/` examples (fee amounts!), Canon challenge tender, Synod frozenFee + fixtures. Workspace build green.
- [ ] **L8 e2e green rule.** Full `make test` green incl. new specs (L1–L5) and updated Arbitrable specs.
- [ ] **L9 qedspec + docs.** `accord.qedspec`: pool-conservation invariant + claim handler; regenerate `formal_verification/`. SPEC (create_dispute/appeal/claim sections + economics table), CONTEXT.md (flip-bounty term), ADR-0004 consequence amendment line, ADR-0020 invariant note, trust-profile, README economics line if present. Grep `2·fee`/`fee + bond` across docs surface.

## Acceptance

- `make test` fully green (green rule).
- Net-flow table proven by tests: for every terminal path, filer/appellant/juror cash-flows sum to the deposits (bounty never minted or trapped except the documented no-flip→pool_extra and remainder-surplus cases).
- No payout before terminal state anywhere in the instruction graph.
- Canon + Synod tender the +1 and their suites are green.

## Non-goals

- Kleros-style two-sided crowdfunding (deferred; builds on this pool).
- Retuning `MIN_SLASH_FEE_RATIO` (ADR-0029 territory).
- Per-Subaccord bounty opt-out (rejected in ADR-0030 Considered Options).

## Summary of Changes

Implemented ADR-0030 end-to-end on top of ADR-0029 (accord-3j58, landed as
1e64a06). All leaf tasks L1–L9 done.

**Program** (`programs/accord`):

- `Dispute.bounty_pool: u64` + `AppealBond.reward: u64`, both carved from the
  existing padding — account sizes and all prior offsets unchanged; new
  `layout::AB_REWARD_OFF` + extended `offsets_match_borsh` pin.
- `Subaccord::filing_fee()` → `(min_jury_size + 1) · fee_per_juror` (single
  source: FeeMismatch, Canon challenge tender, Synod frozen fee).
- `create_dispute` tenders (J+1)·fpj: `fee_paid = J·fpj` (untouched ADR-0029
  settlement math), `bounty_pool = fpj`. `appeal` tenders (2N+1)·fpj:
  `AppealBond.amount` keeps fee+bond semantics (2N·fpj), +1 joins the pool.
- `finalize_dispute` bond pass extended with the **aligned-flipper rule**
  (L3): `prior_result ≠ final_ruling` ∧ own-round result == final ruling.
  Round results are derived from the BOND CHAIN (`bond[j+1].prior_result`,
  pinned by `round_idx == j+1`) — **zero extra accounts**, so the L6
  account-budget fallback (`Round.flipped_to` crank) was not needed;
  remaining-account shape stays `panel + appeal_n`. Equal shares
  `bounty_pool / aligned_count` → `AppealBond.reward`; remainder + the whole
  no-flip pool (L4) join `pool_extra`; `bounty_pool → 0` whenever appealed.
- Failed paths (L5): new `credit_bond_bounty_units` strips each live bond's
  +1 onto `reward` (also PDA-validates bonds on redraw exhaustion, previously
  unvalidated) BEFORE the filer refund; filer refund = `fee_paid +
  bounty_pool` post-strip. `claim_appeal_refund` = `amount − fee + reward`,
  zero-on-claim for both columns.
- New `claim_filing_bounty` instruction (L2) + `FilingBountyClaimed` event:
  Final ∧ current_round == 0 ∧ pool > 0 → vault → filer ATA, idempotent.

**Reconciliation note (L3b)**: the leaf text "first flipper claim returns
bond only" conflicts with ADR-0030's own "the bond forfeit rule itself is
unchanged" — in A→B→A the first flipper's `prior_result` EQUALS the final
ruling, so their bond forfeits under the pre-existing ADR-0004 rule (claim
reverts); only their +1 stays in the split pool. Implemented per ADR + code;
whipsaw test pins bond0 forfeit + bond1 taking all three units.

**Coupling (L7)**: codegen regenerated; SDK `requiredFee`/`appealCost`
(+bounty field)/`claimFilingBounty` + adapter + methods exports; cranker
gains the `claim_filing_bounty` crank (with Final/no-appeal/no-pool skip
gates) and fixes a PRE-EXISTING off-by-one in cancel's bond PDA loop (was
seeds 1..=currentRound; bonds are seeded 0..currentRound−1 by the round being
appealed); CLI `dispute:claim-filing-bounty` + cost/required-fee displays;
skill docs (routing row + fee amounts + claim sections); Canon/Synod derive
the new tender via `filing_fee()` (doc comments updated).

**Docs (L9)**: SPEC (account fields, 9a/9b/12b rows incl. the previously
missing claim/cancel rows, economics + D4 column invariant), CONTEXT.md Flip
Bounty term, ADR-0030 → Implemented (+ bond-chain note), ADR-0004 consequence
amendment, ADR-0020 invariant extension, MkDocs site + README economics,
security-checklist findings 0030-1..3, `accord.qedspec` bounty handlers +
`bounty_pool_conservation` property (`qedgen check`: 0 errors).
`formal_verification/` untouched — it is an unfilled scaffold (3j58
precedent; the qedspec is the source of truth).

**Verification**: 143 Rust unit+LiteSVM tests green against a v2-arch build
(litesvm cannot load sBPFv3 locally — pre-existing; incl. 7 new ADR-0030
tests: funding, Final-no-appeal claim, lone flip, whipsaw, flip+failed
appeal, no-flip roll-up, cancel strip); jest 26 suites / 115 tests green on
Surfpool (v3 .so, runbook deploy; incl. new `claim_filing_bounty` e2e +
updated appeal/dispute/synod/reclaim/canon economics); workspace build+lint
green; CLI 140/140; SDK 98/98. The 2 packages/ui mechanism-additions failures
pre-exist on the clean baseline (verified via stash; no packages/ui files in
this change).
