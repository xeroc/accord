---
# accord-rbvh
title: 'Test: finalize implements cross-round-final settlement (agree-with-final-round) — Ugly 5 / accord-r6ti'
status: scrapped
type: task
priority: normal
created_at: 2026-08-06T02:13:34Z
updated_at: 2026-08-31T18:03:02Z
parent: accord-ukqg
blocked_by:
    - accord-r6ti
---

## Why (repurposed 2026-08-06)

Originally filed as a "parked idea" for the agree-with-final-round appeal rule. On reading the spec, that rule is **already specified** (SPEC Economics: *"every round is re-settled against the final Ruling"*; *"Appeal bond forfeited → Coherent Jurors of the final round if the appeal does not flip"*) AND already tracked as the in-flight task **`accord-r6ti`** (CONCEPT-REVIEW **Ugly 5** — multi-round settlement: per-round crank, final-ruling coherence, immediate participation fee). The current `finalize_dispute` (`lib.rs:1309-1345`) has the Ugly-5 bug: it only settles the **final** round, leaving prior rounds' `active_draws > 0` forever (permanent fund lock).

So this bean is **repurposed** from "parked mechanism idea" → the **TDD TEST** for cross-round-final settlement. It sits under milestone **`accord-ukqg`** (a task cannot parent a task) and is **blocked-by `accord-r6ti`** (the implementation).

## Scope (test)

- [ ] LiteSVM test: after `finalize_dispute`, **every** round's jurors are settled for coherence against the **final** ruling, not their own round's result
- [ ] Test: prior-round jurors get `active_draws` decremented + fees redistributed (the Ugly-5 lock is fixed)
- [ ] Test: appeal bond forfeited → coherent jurors of the **final** round when the appeal does NOT flip; returned when it flips
- [ ] Test: a round-1 bribe does not pay off as "round-coherent" when a later appeal flips the ruling

## Status

**BLOCKED on `accord-r6ti`** (the implementation), which is blocked on `accord-4e7p` (freeze case terms at filing). Do not write this test before `accord-r6ti` lands — it would rework.

## Authority

`SPEC.md` §Economics · `accord-r6ti` (Ugly 5) · `CONCEPT-REVIEW.md` §Ugly 5 · `lib.rs:1309-1345`

## Reasons for Scrapping (2026-08-31 — subsumed by accord-r6ti's shipped test suite)

Every checkbox is green in the tree today, delivered as part of accord-r6ti (completed) rather than as this blocked follow-up:

- Prior-round settlement vs the FINAL ruling + `active_draws` release: `programs/accord/tests/accumulator_litesvm.rs` prior-round settlement suite (~:3833–4072, incl. `settle_round_no_coherent_rewards_revealers_only`) asserts coherence against `dispute.final_ruling` and released `active_draws`/`slash_reserve`.
- Bond flip → refund / no-flip → final round's coherent jurors: `tests/src/appeal.spec.ts` :501-614 (flip: bond survives, refund, idempotent) and :615-743 (no-flip: bond zeroed, forfeit 7·fee split across the final round's 4 coherent jurors).
- 'Round-1 bribe does not pay as round-coherent when flipped': covered by settle-vs-final (not own-round) coherence in `utils::settle_round_accounts` + its LiteSVM tests (the overturn path slashes the prior round's majority even though it was round-coherent).

Forward note: accord-3j58 (ADR-0029) will move the FEE assertions in these same tests (participation credit → settlement) — that rework is already tracked on 3j58's leaf list (L2), so no test intent is lost by scrapping this bean.
