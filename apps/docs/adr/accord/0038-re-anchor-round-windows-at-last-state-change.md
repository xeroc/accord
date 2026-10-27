# Re-anchor round windows at the last state change

`draw_seat` fixes `review_end`/`commit_end`/`reveal_end` at panel-fill:
`reveal_end = draw + review_window + commit_window + reveal_window`. The early
relaxations (ADR-0021 family) only relax **lower** bounds — reveal opens once
the panel is fully committed, `finalize_round` resolves once everyone revealed —
but `reveal_end` never moved. An eager panel that finished in seconds still
idled out the full scheduled commit+reveal span before the appeal clock
started, because every deadline consumer (`appeal`, `finalize_dispute`,
`cancel_dispute`) anchors at `reveal_end + appeal_window`.

Devnet repro (2026-10-26, Inveigo arena court `5dcn9…SXN1`, windows
1s/12h/12h/30s, N=1 attestation-gated AI juror): commit+reveal landed within
seconds, finality locked at ≈ draw+24h+30s. For AI-agent courts the window
lengths are only supposed to cap juror *lateness*, not set the dispute
*duration*.

## Decision

`Round.review_end/commit_end/reveal_end` are ordinary mutable `i64` fields —
nothing requires them to be immutable after draw. Re-anchor `reveal_end`
**shrink-only** at the last state change, exactly two sites:

1. **`commit` (panel-full)** — the last commitment re-anchors
   `reveal_end = min(reveal_end, now + reveal_window)`. Pure shrink by
   construction: the commit gate guarantees `now < commit_end` and the
   draw-time anchor is `commit_end + reveal_window`, so
   `now + reveal_window < reveal_end` strictly. Every committed juror gets the
   full `reveal_window` from the last commit.
2. **`finalize_round` (early resolve, all revealed, `now < reveal_end`)** — pin
   `reveal_end = now` before writing the result. The appeal window opens at
   the actual resolution time instead of the scheduled reveal close. The
   **timeout path** (`now >= reveal_end`) deliberately does NOT rewrite: a
   lazy cranker landing `finalize_round` days late must not push the appeal
   deadline out.

One field, three consumers — `appeal` (`now < reveal_end + appeal_window`),
`finalize_dispute` (`now >= reveal_end + appeal_window`), `cancel_dispute`
(`now > reveal_end + appeal_window + grace`) — all re-anchor automatically.
Net effect for the reporting court: commit at t+5s, reveal at t+10s, appeal
window [t+10s, t+40s), `Final` at ≈ t+40s. Same court, same accounts.

**Invariant (the whole safety argument): deadlines only ever move EARLIER.**
No juror loses time, nobody's lock-up extends, and `cancel_dispute`'s
post-draw escape only becomes available sooner — the safe direction for a
liveness valve. No new griefing vector: withholding `finalize_round` delays
the appeal window *opening* exactly as it does today; it cannot extend
anything past `resolution + appeal_window`.

## Considered Options

- **Windows fixed at draw (status quo).** Rejected — eager panels idle out the
  scheduled span; dispute duration = sum of windows regardless of juror speed.
  Unusable for AI-agent courts, which this protocol explicitly targets
  (ADR-0036 jurat, attestation-gated Subaccords).
- **Adding a `resolved_at` field to `Round`.** Rejected — account-layout break
  (realloc/migration) for zero benefit: `reveal_end` is already the single
  deadline anchor every consumer reads, and mutating it shrinks the diff to
  two guarded writes. No layout change, no realloc, no migration, same program
  ID (deploy = ordinary upgrade).
- **Re-anchoring `review_end` too.** Rejected — there is no on-chain "review
  done" state change to anchor to. `review_end` stays as the draw-time lower
  bound for the first commit.
- **Re-anchoring `commit_end` at panel-full.** Deliberately left stale: the
  `Reveal` state disambiguates, `commit`'s gates are moot once all commitments
  are in, and `reveal`'s lower bound is `|| all_committed`. Smallest diff.

## Consequences

- **Appeal semantics:** the appeal window opens at *resolution* (the
  re-anchored `reveal_end`), not at the scheduled reveal close. Appellants get
  the full `appeal_window` from the actual resolve time.
- **Cranker lateness never extends anything** (timeout path is a no-op write).
- **Old rounds** created before the upgrade keep their semantics until their
  next transition; re-anchoring applies at transitions only. `redraw` zeroes
  the windows as before and a fresh panel re-anchors at the new draw time.
- **IDL/SDK:** no instruction signature or account-shape change — Codama
  output is byte-identical, no codegen, no facade change. Arbitrable CPI
  consumers (Synod `settle`, Inveigo) benefit automatically.
- **Off-chain mirrors** (jurat `dutyPhase` tracker, dApps) that read the
  account fields stay correct: `final` derives from the re-anchored
  `reveal_end` + `appeal_window`.
- Docs updated: `reference/state-machine.md`, `reference/accounts.md`,
  `integration/draw-voting.md` (step 6a), `integration/appeals.md`,
  `programs/accord/SPEC.md`, `CONTEXT.md`.

References: ADR-0021 (the early-open family this completes), ADR-0022
(per-Subaccord `appeal_window` frozen on `CaseTerms`), bean `accord-9952`
(devnet repro + design), LiteSVM suite `programs/accord/tests/reanchor_litesvm.rs`.
