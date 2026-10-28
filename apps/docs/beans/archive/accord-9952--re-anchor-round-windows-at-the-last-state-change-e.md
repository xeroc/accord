---
# accord-9952
title: Re-anchor round windows at the last state change — eager-panel fast finality (program + docs)
status: completed
type: task
priority: high
created_at: 2026-10-26T19:08:53Z
updated_at: 2026-10-28T13:45:40Z
---

## Why (user-reported, devnet)

Inveigo arena court `5dcn9NbJqCx3j7hZ6ZmWQ8zieb2EDVbpaSUjaC1PSXN1` (review=1s, commit=43,200s, reveal=43,200s, appeal=30s, N=1 AI juror): the juror commits+reveals within seconds, but the dispute cannot go `Final` for ~24h. Finality = `reveal_end + appeal_window`, and `reveal_end` is fixed at draw as `draw_time + review + commit + reveal` (full window lengths, `draw_seat.rs:269-281`). The existing early relaxations (`reveal.rs:57` reveal opens on all-committed; `finalize_round.rs:46` round resolves on all-revealed) only relax **lower** bounds — nothing ever pulls `reveal_end` earlier. Result: an eager panel finishes its work in seconds, then idles out the full scheduled commit+reveal span before the appeal clock even starts. For N=1 attestation-gated AI courts (the Inveigo product) this makes every dispute a 24h+ affair regardless of how fast the juror actually is.

The fix: re-anchor the window deadlines **at the last state change** — the same principle the early-open/early-resolve relaxations already apply to lower bounds, extended to the upper bound and the appeal anchor.

## Repro & root cause (cross-repo, 2026-10-26 devnet)

Court created from the Inveigo CLI (`pnpm --filter @inveigo/cli dev court-create … --review-window 1 --appeal-window 30 …`, mint 4zMMC…ncDU = devnet USDC): `read:subaccord 5dcn9…SXN1` shows review=1, commit=43,200, reveal=43,200, appeal=30, max_appeals=0, min_jury_size=1 — everything stored exactly as passed. The 30s appeal window is NOT the bug; the anchor it counts from is.

Chain of causes:

1. `--commit-window`/`--reveal-window` were not passed → Inveigo `COURT_DEFAULTS` filled 43,200s each (`inveigo/apps/cli/src/lib/court.ts:25-26` — the ADR-0012/0029 mainnet-economics profile; 12h + 12h).
2. Accord `draw_seat` fixes `reveal_end = draw + review + commit + reveal` up front (`draw_seat.rs:269-281`) — 86,401s ≈ 24h after draw for this court.
3. Early relaxations only open phases sooner (lower bounds); `reveal_end` never moves → `finalize_dispute` (`now >= reveal_end + appeal_window`) locks finality at ≈ draw+24h+30s regardless of juror speed. The operator observes "appeal window way bigger than 30 seconds" — it is actually the scheduled commit+reveal span the eager panel never used.
4. Context: the 30s window was accepted at all because `MIN_APPEAL_WINDOW_SECS` is locally set to 1 with an explicit NOTE that ADR-0022's 1h floor was disabled "to allow quick ai agent review" (`constants.rs:45-50`). This bean does not touch that floor; the two combine into the intended arena behavior (tiny windows + re-anchored clocks).

## Design — shrink-only re-anchoring, zero account-layout change

**Key insight:** `Round.review_end/commit_end/reveal_end` are ordinary mutable `i64` fields on an existing `#[zero_copy]` account. Nothing on-chain or off-chain requires them to be immutable after draw. Every downstream deadline already derives from `reveal_end`:

- `appeal.rs:96-100` — `appeal_deadline = round.reveal_end + terms.appeal_window`
- `finalize_dispute.rs:46-50` — same anchor, finality gate
- `cancel_dispute.rs:95-99` — same anchor + global grace

So re-anchoring `reveal_end` at a transition automatically re-anchors appeals, finality, and the cancel escape — one field, three consumers, no new state.

**Re-anchor sites (exactly two):**

1. **`commit.rs:67-69` (panel-full commit — the "all committed" state change):**
   ```rust
   if round.commit_count == round.juror_count {
       dispute.state = DisputeState::Reveal;
       // Re-anchor: the reveal window starts when the last commitment lands,
       // not at the scheduled commit_end (shrink-only — see invariant).
       round.reveal_end = round
           .reveal_end
           .min(now.checked_add(dispute.terms.reveal_window as i64)
               .ok_or(AccordError::ArithmeticOverflow)?);
   }
   ```
   Since `now < commit_end` and `commit_end + reveal_window == reveal_end` (old), `now + reveal_window < reveal_end` strictly — this is always a pure shrink. Every committed juror gets the full `reveal_window` from the last commit.

2. **`finalize_round.rs` (early resolve — `all_revealed && now < reveal_end` path):** set `round.reveal_end = now` before writing the result / flipping to `RoundResolved`. By construction `now < reveal_end`, so shrink-only. The appeal window then opens at the actual resolution time instead of the scheduled reveal close. On the **timeout path** (`now >= reveal_end`) do NOT rewrite — a lazy cranker landing `finalize_round` days late must not push the appeal deadline out.

**Invariant (the whole safety argument): deadlines only ever move EARLIER.** No juror loses time (revealers get `reveal_window` from the last commit; appellants get `appeal_window` from resolution); nobody's lock-up extends; `cancel_dispute`'s post-draw escape only becomes available sooner, which is the safe direction for a liveness valve. No new griefing vector: withholding `finalize_round` delays the appeal window *opening* exactly as it does today — it cannot extend anything past `resolution + appeal_window`.

**What does NOT change:**

- **Account layout:** no field added/removed/resized on `Round`, `Dispute`, or `Subaccord`. `Round` stays 2,816 bytes, Pod offsets unchanged, `INIT_SPACE` unchanged, discriminators unchanged → **no realloc, no migration, same program ID** (deploy = ordinary upgrade). Old rounds created before the upgrade keep their original semantics until their next transition; re-anchoring applies at transitions only.
- **IDL / SDK:** no instruction signature or account-shape change → Codama output is byte-identical; **no codegen, no SDK facade change, no Inveigo CPI change** (`settle` benefits automatically).
- **`review_end`:** no on-chain event marks "review done" — there is no state change to anchor to. Stays as the draw-time lower bound for the first commit.
- **`commit_end` at panel-full:** deliberately left stale (state field `Reveal` already disambiguates; `commit.rs` gates are moot once all commitments are in; `reveal.rs` lower bound is `|| all_committed`). Smallest diff.
- **`draw_seat.rs` / `redraw.rs`:** initial anchoring and the redraw zeroing are unchanged.

**Net effect for the reporting court (1s/12h/12h/30s, N=1):** commit at t+5s → `reveal_end = t+5s+12h`; reveal at t+10s → `reveal_end = t+10s`; appeal window [t+10s, t+40s); `Final` at ≈ t+40s. Same court, same accounts, ~24h → ~40s.

## Scope (todos)

### a) Program (`programs/accord`) — TDD, RED first

- [ ] RED `commit.rs`: panel-full commit re-anchors `reveal_end` to `now + terms.reveal_window` (assert `reveal_end` moved; assert shrink-only when `now + reveal_window > reveal_end` is impossible-by-construction — pin with a doc comment + test that a later reveal is still accepted within `reveal_window` of the last commit).
- [ ] RED `finalize_round.rs`: early resolve (all revealed) pins `reveal_end = now`; `finalize_dispute` becomes eligible at `resolve_ts + terms.appeal_window`; `appeal` accepted before / rejected after that deadline.
- [ ] RED `finalize_round.rs` timeout path: late `finalize_round` does NOT extend `reveal_end` (value unchanged; appeal deadline still `original_reveal_end + appeal_window`).
- [ ] RED interaction: re-anchored round + `redraw` (shortfall) still zeroes windows cleanly.
- [ ] GREEN: implement the two re-anchor sites (checked arithmetic, `ArithmeticOverflow` on overflow).
- [ ] Full `cargo test` (incl. layout tests) green; existing warps that assumed fixed `reveal_end` updated to read the re-anchored value where they finalize early.

### b) Docs (same change, per AGENTS.md docs-match-reality)

- [ ] New **ADR-0038** "Re-anchor round windows at the last state change" — Decision, Considered Options (fixed-at-draw vs re-anchor; adding a `resolved_at` field — rejected: layout break for zero benefit), Consequences (shrink-only invariant, appeal semantics = window opens at resolution, cranker-lateness non-extension).
- [ ] `apps/docs/adr/accord/index.md` + authoring footer bump.
- [ ] MkDocs `reference/state-machine.md`: round-window timeline note (set at draw; `reveal_end` re-anchored shrink-only at panel-full commit / early resolve).
- [ ] MkDocs `integration/draw-voting.md` steps 5/6a + `integration/appeals.md` gate table: appeal window opens at **resolution** (re-anchored `reveal_end`), not scheduled reveal close.
- [ ] MkDocs `reference/accounts.md` `Round` row + `programs/accord/SPEC.md` state-machine line + `CONTEXT.md` glossary if they say windows are fixed at draw.
- [ ] `AGENTS.md` / jurat `tracker.ts` header comments ("windows computed on-chain at draw") — add the re-anchor note so the mirror doesn't drift.

### c) Housekeeping

- [ ] Changeset (program behavior change).
- [ ] Confirm jurat `dutyPhase` needs no change (it reads the account fields — `final from revealEnd` stays correct as `reveal_end` re-anchors; add one tracker test pinning a re-anchored round's phase).
- [ ] Surfpool e2e: one eager-panel spec asserting finality at `resolve_ts + appeal_window` (not `draw + full windows`).

## Inveigo follow-ups (out of scope here — separate beans in ../inveigo)

- **Devnet workaround until this lands:** create a fresh court with tight windows (`--review-window 5 --commit-window 60 --reveal-window 60 --appeal-window 30`; nonzero only — a 0 window empties the commit window and makes the pool unvotable, `create_subaccord.rs:125-127`). Do NOT retune the existing court through `propose`/`execute` — `PendingUpdate` carries a 48h timelock; a fresh `--salt` (new `domain_ref` → new PDA) is cheaper on devnet.
- **Open question for the arena profile:** `COURT_DEFAULTS` still ships 12h commit/reveal for courts whose juror is an attestation-gated AI acting in seconds. Decide per-context defaults (or a `--fast` profile) in the inveigo repo — independent of this bean; with re-anchoring, the window lengths only cap juror lateness, they no longer set dispute duration for eager panels.

## Authority

`draw_seat.rs:269-281` (fixed anchoring) · `commit.rs:41-69` (gates + panel-full flip) · `reveal.rs:51-60` (early open, lower bound only) · `finalize_round.rs:40-48` (early resolve) · `finalize_dispute.rs:46-50`, `appeal.rs:96-100`, `cancel_dispute.rs:95-99` (the three `reveal_end` consumers) · `redraw.rs:221-224` (window zeroing) · `constants.rs:43-50` (default + locally-disabled floor) · ADR-0021 (early-open family) · ADR-0022 (per-Subaccord `appeal_window`, frozen on `CaseTerms`) · `apps/jurat/src/duty/tracker.ts` (off-chain mirror reads account fields) · Inveigo side: `inveigo/apps/cli/src/lib/court.ts:18-31` (`COURT_DEFAULTS`), `inveigo/apps/cli/src/commands/court-create.ts:96-111` (second-unit flags). Devnet repro: Inveigo court `5dcn9…SXN1` (windows 1/43200/43200/30).
