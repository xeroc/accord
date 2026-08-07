# Per-Subaccord configurable appeal window

The appeal window — the gap between a round resolving (`RoundResolved`) and the
dispute going final (`Final`), during which any third party may escalate to a
`2N+1` panel — is a **per-Subaccord, filing-time-frozen parameter**, not a
program-wide constant.

It was previously the hardcoded global `APPEAL_WINDOW_SECS` (3 days), the odd one
out: the three voting windows (`review`/`commit`/`reveal`) were already
per-Subaccord. That is wrong for the product. A high-stakes insurance Subaccord
wants a long, deliberative appeal window; a low-stakes micro-arbitration pool
wants hours, not days, so the filer gets a ruling fast and juror capital is not
locked unnecessarily.

This ADR makes `appeal_window` follow the exact pattern ADR-0019 established for
`aggregation`, and the Ugly-6 freeze (`accord-4e7p`) for every `CaseTerms` field:
disputes read `dispute.terms.appeal_window`, never the live `sub.appeal_window`.

## Decision

1. **New field `appeal_window: u64` (seconds)** on `Subaccord`, `CaseTerms`,
   `CreateSubaccordParams`, and a new `UpdatePayload::AppealWindow(u64)` variant
   (timelocked like the other windows, ADR-0005).
2. **The const becomes the default, not the runtime value.** `APPEAL_WINDOW_SECS`
   → `DEFAULT_APPEAL_WINDOW_SECS` (3 days, unchanged) — now only the
   `create_subaccord` default + the "v1 default" the docs cite.
3. **Three call sites switch from const → `dispute.terms.appeal_window`**:
   `finalize_dispute` (`reveal_end + terms.appeal_window`), `appeal` (same), and
   `cancel_dispute`'s post-draw branch (`reveal_end + terms.appeal_window +
POST_DRAW_CANCEL_GRACE_SECS`).
4. **Non-zero floor.** `MIN_APPEAL_WINDOW_SECS` = 1 hour (3600). `appeal_window
== 0` is rejected. A pool that truly wants no appeals sets `max_appeals == 0`
   (the explicit, existing knob — `appeal` requires `current_round <
max_appeals`); `appeal_window` is not a second way to silently disable the
   appeal safety valve. The appeal is the Schelling safety valve: a wrong
   round-1 ruling gets overturned by a larger panel; a 0-window pool would have
   no recourse against a captured/thin round-1 panel, and a creator who forgets
   the field would get instant-finality-by-default — the opposite of the safe
   default.
5. **`POST_DRAW_CANCEL_GRACE_SECS` stays a global const** — the liveness floor is
   a protocol concern, not a per-pool taste.

## Considered Options

**Where the window lives.**

- **Program-wide constant (status quo).** Rejected — one size does not fit all
  Subaccords; high-stakes vs micro-arbitration want opposite windows.
- **Per-Subaccord, filing-time-frozen (chosen).** Matches the three voting
  windows; the 48h timelock (ADR-0005) governs only future disputes, so an active
  case is immune to governance changes for its whole life (Ugly-6).
- **Per-Dispute (filer chooses at filing).** Rejected — the window is a pool
  taste, not a per-case economic lever; the filer already pays the fee and picks
  nothing else about the mechanism. Per-Dispute would also let a filer shorten
  the window to dodge appeals.

**Floor.**

- **Allow 0 = instant finality.** Rejected — disables the appeal safety valve and
  is a footgun (forgotten field ⇒ instant finality by default).
- **Non-zero floor, `max_appeals == 0` for no-appeals intent (chosen).** One
  explicit knob per intent; the default (3 days) is the safe one.
- **Hard upper cap.** Rejected — a large window only extends the juror lock, it
  does not overflow the gate (`checked_add` + `ArithmeticOverflow` already guard
  the deadline math). No cap beyond the `u64`/`i64` type.

## Consequences

- `Subaccord` and `CaseTerms` each grow by 8 bytes → `Subaccord::INIT_SPACE` and
  the `CaseTerms`-derived `Dispute` space grow. The manual `layout` offset consts
  slice `JurorStake`/`AppealBond`, **not** these two structs, so there is no
  layout-const drift; the `INIT_SPACE` assert and
  `layout_tests::offsets_match_borsh` still pass. No on-chain migration: the
  program is pre-deployment (greenfield).
- `UpdatePayload::AppealWindow` joins the ADR-0005 timelocked-update set; it is
  mutable via propose/execute like every other window. (A future governance
  change affects only disputes filed after it lands — Ugly-6.)
- This is a sibling of the dispute-kit config family (ADR-0019): `aggregation`,
  the voting windows, and `appeal_window` are all per-Subaccord, filing-time-
  frozen. ADR-0004 (party-agnostic appeal) implicitly assumed the global const;
  the appeal right itself is unchanged, only its window is now configurable.
- Layout-coupled with ADR-0020 (two-mint, `Subaccord` resize) and ADR-0021
  (reveal-quorum, `CaseTerms` resize): all three change the same two structs.
  Sequenced or batched to minimize IDL-regen churn.
- Amends ADR-0004 (appeal window is per-Subaccord, was global) and ADR-0005
  (`UpdatePayload::AppealWindow` joins the timelocked set). Supersedes nothing.

## Implementation

Tracked in bean `accord-w663`. Tasks: `appeal_window` field on the four structs;
const rename + floor; `create_subaccord` validation + write; `CaseTerms` freeze;
`execute_subaccord_update` match arm; the three call sites; SDK codegen +
`CreateSubaccordArgs` + `assertValidAppealWindow` + const rename; LiteSVM TDD
(store, freeze, floor rejection, finalize honors the per-dispute window);
Surfpool e2e warps; this ADR + SPEC/CONTEXT/AGENTS/MkDocs.
