---
# veridao-pq1s
title: Voting & Ruling
status: completed
type: epic
priority: normal
created_at: 2026-08-03T23:09:55Z
updated_at: 2026-08-04T07:10:00Z
parent: veridao-rlno
blocked_by:
  - veridao-fr1x
---

Commit-reveal voting + finalization economics.

## Tasks

- [x] commit(dispute, h) — h = hash(vote, salt, juror_pubkey); one per drawn juror; immutable after commit
- [x] reveal(dispute, vote, salt) — verify h; record vote; non-reveal penalized (>= incoherent)
- [x] finalize_round / finalize_dispute — permissionless crank; tally (plurality); on final round: slash alpha\*min_stake per incoherent, redistribute fees+slash equally to coherent, decrement active_draws, write final ruling
- [x] get_ruling(dispute) — read-only; Arbitrable reads final_ruling

## Acceptance (TDD)

Commit-copying prevention (pubkey in hash); reveal-window gates; coherence math exactness (rounding-safe); cross-round settlement vs final ruling; crank advances on window expiry.

## Summary of Changes

### Instructions added (`programs/accord/src/lib.rs`)

- **`commit(dispute, commitment)`** — stores `hash(vote_le ‖ salt ‖ juror_pubkey)` per drawn
  juror. Allowed during commit window (`review_end ≤ now < commit_end`). Pubkey in hash
  prevents commit-copying (a juror who copies another's hash can never reveal it). One per
  juror; immutable. Transitions `Drawn → Commit`.

- **`reveal(dispute, vote, salt)`** — verifies the stored hash matches
  `hash(vote_le ‖ salt ‖ juror_pubkey)`, records the vote. Allowed during reveal window
  (`commit_end ≤ now < reveal_end`). Transitions `Commit → Reveal`.

- **`finalize_round`** — permissionless crank. After `reveal_end`, tallies by plurality
  (odd panels make ties impossible). Handles all active states (Drawn/Commit/Reveal).
  Defaults to option 0 if zero reveals (SPEC §4.6 fn.10 edge case). Transitions to
  `RoundResolved`.

- **`finalize_dispute`** — permissionless crank. After `reveal_end + APPEAL_WINDOW_SECS`,
  settles the final round's economics as pure ledger accounting (no SPL transfers —
  tokens already in vault):

  1. Coherence = revealed vote == final ruling.
  2. Slash each incoherent/non-revealing juror: `α_bps · min_stake / 10_000`.
  3. Pool = `slash_total + panel · fee_per_juror`.
  4. Equal split among coherent (integer div; remainder = protocol surplus).
  5. Decrement `active_draws` for ALL drawn jurors.
  6. Write `final_ruling`, transition to `Final`.
     Drawn `JurorStake` accounts via `remaining_accounts`, PDA-verified per round.jurors.

- **`get_ruling`** — read-only CPI entry. Returns `Option<u8>` (the dispute's
  `final_ruling`). Arbitrables call via CPI to lazily read the outcome.

### State changes

- **`Round`** struct gained three `i64` window deadlines: `review_end`, `commit_end`,
  `reveal_end`. Set by the `draw` handler (= draw_time + review/commit/reveal windows).
  Padding adjusted for Pod alignment (total multiple of 8).

### Constants

- `APPEAL_WINDOW_SECS = 3 days` — program-level appeal window before finalization.

### Errors added

`NotDrawnJuror`, `InvalidVote`, `AlreadyRevealed`, `AppealWindowOpen`.

### Tests (`tests/voting_litesvm.rs`)

14 LiteSVM tests covering: happy commit→reveal→finalize cycle, commit/reveal window
gates, commit-copying prevention (pubkey in hash), double-commit rejection, wrong-salt
rejection, exact economics (2 coherent + 1 incoherent), non-revealer treated as
incoherent, crank timing (before reveal_end / before appeal window), non-drawn juror
rejection, invalid vote index, and get_ruling before/after finalization.

All 70 tests in the full LiteSVM suite pass (14 new + 56 existing).
