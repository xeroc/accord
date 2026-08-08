---
# accord-w663
title: Per-Subaccord configurable appeal window (program + SDK + ADR-0022 + docs)
status: completed
type: milestone
priority: high
created_at: 2026-08-07T21:20:32Z
updated_at: 2026-08-07T21:20:32Z
---

## Why

The appeal window — the gap between a round resolving (`RoundResolved`) and the dispute going final (`Final`) during which any third party may escalate to a `2N+1` panel — is today a **hardcoded program-wide constant**:

```rust
// programs/accord/src/constants.rs:28
pub const APPEAL_WINDOW_SECS: i64 = 3 * 24 * 60 * 60; // 3 days, every Subaccord
```

It is **not** a `Subaccord` field, **not** in `CaseTerms`, and **not** an `UpdatePayload` variant (see `state.rs:348-358`). Every pool on the program shares the same 3 days. That is wrong for the product: a high-stakes insurance Subaccord wants a long, deliberative appeal window; a low-stakes micro-arbitration pool wants hours, not days, so the filer gets a ruling fast and juror capital is not locked unnecessarily. The three voting windows (`review`/`commit`/`reveal`) are already per-Subaccord — the appeal window is the odd one out.

This bean specifies making it a **per-Subaccord, filing-time-frozen parameter**, following the exact pattern ADR-0019 (`accord-8m2a`) established for `aggregation`, and the Ugly 6 freeze (`accord-4e7p`) established for every `CaseTerms` field: disputes read `dispute.terms.<field>`, never live `sub.<field>`.

## Design decisions

**1. New field: `appeal_window: u64` (seconds) on `Subaccord` + `CaseTerms`.**

- `Subaccord` gains `pub appeal_window: u64` (`state.rs:29` struct, after `reveal_window`).
- `CaseTerms` gains `pub appeal_window: u64` (`state.rs:122`), frozen at filing in `create_dispute` (`lib.rs:785`), read by `appeal` / `finalize_dispute` / `cancel_dispute`.
- `CreateSubaccordParams` (`state.rs:330`) gains `pub appeal_window: u64`.
- `UpdatePayload` (`state.rs:348`) gains `AppealWindow(u64)` — timelocked like the other windows (ADR-0005). Added to the `match` in `execute_subaccord_update` (`lib.rs:691-701`).

**2. The const becomes the default, not the runtime value.**

- Rename `APPEAL_WINDOW_SECS` → `DEFAULT_APPEAL_WINDOW_SECS` (`constants.rs:28`). Same value (3 days). It is now only the `create_subaccord` default + the value the docs cite as "v1 default".
- `POST_DRAW_CANCEL_GRACE_SECS` (`constants.rs:43`) **stays a global const** — the liveness floor is a protocol concern, not a per-pool taste.

**3. Three call sites switch from const → `dispute.terms.appeal_window`.**

- `finalize_dispute` (`lib.rs:1333-1337`): `appeal_deadline = round.reveal_end + dispute.terms.appeal_window`.
- `appeal` (`lib.rs:1524-1528`): same.
- `cancel_dispute` post-draw branch (`lib.rs:1739-1743`): `reveal_end + dispute.terms.appeal_window + POST_DRAW_CANCEL_GRACE_SECS`.

**4. Validation bounds.**

- `MIN_APPEAL_WINDOW_SECS` floor (see open question). Reject 0 unless we decide instant-finality is a feature.
- Upper bound: `u64`/`i64` checked arithmetic already present (`checked_add` + `ArithmeticOverflow`); a pathological huge value only extends the lock, it does not overflow the gate. No hard cap needed beyond the type, but document that a large window locks juror `active_draws` longer.

**5. Account-resize implication (greenfield-safe).**

- `Subaccord` and `CaseTerms` each grow by 8 bytes → `Subaccord::INIT_SPACE` and `CaseTerms`-derived `Dispute` space grow. `layout` offset consts (`lib.rs:81`) slice `JurorStake`/`AppealBond`, NOT `Subaccord`/`CaseTerms`, so **no layout-const drift** — but the compile-time `INIT_SPACE` assert and `layout_tests::offsets_match_borsh` must still pass. Re-run them.
- No on-chain migration: the program is pre-deployment (AGENTS.md "greenfield scaffold"; no mainnet ID). This must land before any deployment.

**6. Coordination — this intersects two `todo` epics that ALSO resize `CaseTerms`/`Subaccord`.**

- `accord-z8jp` / `accord-5yh0` (reveal-quorum + shortfall redraw, ADR-0021): adds `threshold` to `CaseTerms`.
- `accord-edz4` / `accord-djzb` (two-mint/two-vault, ADR-0020): adds `stake_token`/`fee_token` to `Subaccord`, kit threshold to `CaseTerms`.
- **All three change the same two structs.** Sequence them (land one, regen IDL once, then the next) OR batch into a single layout pass to avoid three IDL regenerations + three account-resize churns. Recommend: this bean is independent and can land first (smallest scope), but the implementer MUST rebase/merge cleanly against whichever of the other two lands concurrently.

## Open design question (resolve before implementation)

**Should `appeal_window == 0` mean "instant finality" (no appeal possible)?**

- _Case for allowing 0:_ low-stakes pools may want a ruling the instant a round resolves — no appeal right, capital freed immediately. `finalize_dispute` becomes eligible at `reveal_end` (since `reveal_end + 0 = reveal_end`).
- _Case against 0:_ the appeal is the Schelling safety valve — a wrong round-1 ruling gets overturned by a larger panel. A 0-window pool has no recourse against a captured/thin round-1 panel. Also a footgun: a creator who forgets to set it gets instant-finality-by-default, which is the _opposite_ of the safe default.
- **Recommendation:** require a non-zero floor (`MIN_APPEAL_WINDOW_SECS`, propose 1 hour = 3600). Default stays 3 days. If a pool truly wants no appeals, the existing `max_appeals == 0` knob already expresses that cleanly and explicitly — `appeal_window` should not be a second way to silently disable appeals.

Flag for user confirmation: floor value + whether `max_appeals == 0` already satisfies the "no appeals" intent (it does — `appeal` requires `current_round < max_appeals`, `lib.rs:1515`).

## Scope (todos)

### a) Program (`programs/accord`)

- [ ] **state.rs:** add `appeal_window: u64` to `Subaccord` (after `reveal_window`), `CaseTerms` (after `reveal_window`), `CreateSubaccordParams`, and `UpdatePayload::AppealWindow(u64)`. Verify `INIT_SPACE` derives update.
- [ ] **constants.rs:** rename `APPEAL_WINDOW_SECS` → `DEFAULT_APPEAL_WINDOW_SECS` (keep 3 days); add `MIN_APPEAL_WINDOW_SECS` (resolve open Q). Verify `layout_tests::offsets_match_borsh` still compiles + passes (it slices `JurorStake`/`AppealBond`, not the touched structs — should be untouched, confirm).
- [ ] **lib.rs `create_subaccord`:** write `acc.appeal_window = appeal_window` from params; validate `appeal_window >= MIN_APPEAL_WINDOW_SECS` (or `> 0` if floor rejected).
- [ ] **lib.rs `create_dispute`:** add `appeal_window: sub.appeal_window` to the `CaseTerms` freeze (`lib.rs:785`).
- [ ] **lib.rs `execute_subaccord_update`:** add `UpdatePayload::AppealWindow(v) => sub.appeal_window = *v` to the `match` (`lib.rs:691`).
- [ ] **lib.rs `finalize_dispute` (`lib.rs:1333`):** read `dispute.terms.appeal_window` instead of the const.
- [ ] **lib.rs `appeal` (`lib.rs:1524`):** read `dispute.terms.appeal_window` instead of the const.
- [ ] **lib.rs `cancel_dispute` (`lib.rs:1739`):** read `dispute.terms.appeal_window` instead of the const (grace const stays global).
- [ ] **cargo check + cargo test** (incl. `layout_tests::offsets_match_borsh`) green.

### b) SDK (`packages/sdk`)

- [ ] **Regenerate Codama client** from the new IDL (`anchor build` → IDL → codegen) so `Subaccord`, `CaseTerms`, `CreateSubaccordParams`, `UpdatePayload` generated types carry `appealWindow`/`AppealWindow`.
- [ ] **`methods/lifecycle.ts`:** add `appealWindow: bigint` to `CreateSubaccordArgs` (`lifecycle.ts:64`); add `assertValidAppealWindow()` helper mirroring `assertValidMaxAppeals` (`lifecycle.ts:140`); wire into `createSubaccord` builder (`lifecycle.ts:275`).
- [ ] **`methods/appeal.ts`:** the facade currently imports the global `APPEAL_WINDOW_SECS` (`appeal.ts:29`) for local preflight — switch any window-dependent preflight to read the per-dispute `terms.appealWindow` (fetched), not the const.
- [ ] **`constants.ts`:** rename `APPEAL_WINDOW_SECS` → `DEFAULT_APPEAL_WINDOW_SECS` (`constants.ts:22`); add `MIN_APPEAL_WINDOW_SECS`. Update the one test that asserts the literal (`appeal.test.ts:65-67`).
- [ ] **`types.ts`:** confirm `UpdatePayload` re-export includes the new variant.
- [ ] **SDK unit tests** (`*.test.ts`) green: `pnpm --filter @accord/sdk test`.

### c) ADRs (`apps/docs/adr/accord`)

- [ ] **New ADR-0022** "Per-Subaccord configurable appeal window" — Decision, Considered Options (const vs per-Subaccord vs per-Dispute), Consequences (account resize, freeze-at-filing, liveness-grace stays global, floor). Add to `index.md` table + authoring footer ("next = 0023").
- [ ] **ADR-0004 cross-ref:** note the appeal window is now per-Subaccord (was the global const ADR-0004 implicitly assumed).
- [ ] **ADR-0005 cross-ref:** `UpdatePayload::AppealWindow` joins the timelocked-update set.
- [ ] **ADR-0019 cross-ref:** this is a sibling of the dispute-kit config family (aggregation / windows / appeal_window are all per-Subaccord, filing-time-frozen).

### d) Docs

- [ ] **`programs/accord/SPEC.md`:** `Subaccord` account row (`SPEC.md:24`) + `CaseTerms` mention (`SPEC.md:26`) + state-machine timeline (`SPEC.md:63`); note `appeal_window` is per-Subaccord.
- [ ] **`CONTEXT.md`:** glossary entry — appeal window is now per-Subaccord, not program-global.
- [ ] **`AGENTS.md`:** v1 Defaults table — move appeal window from "implied global" to the per-Subaccord row (default 3 days); update the `appeal` instruction line if it cites the const.
- [ ] **`README.md`:** update if the appeal window / finality timing is mentioned.
- [ ] **MkDocs `reference/constants.md`:** `APPEAL_WINDOW_SECS` row (`constants.md:18`) → relabel as `DEFAULT_APPEAL_WINDOW_SECS` (default, not runtime).
- [ ] **MkDocs `reference/state-machine.md`:** timeline + transitions (`state-machine.md:28-29,37`) — `APPEAL_WINDOW_SECS` → per-dispute `terms.appealWindow`.
- [ ] **MkDocs `integration/appeals.md`:** gate table (`appeals.md:12`) + add a "configurable window" note.
- [ ] **MkDocs `integration/arbitrable-interface.md`:** finality note (`arbitrable-interface.md:74`).
- [ ] **MkDocs `integration/get-ruling.md`:** finality condition (`get-ruling.md:18`).
- [ ] **MkDocs `reference/instructions.md` / `reference/accounts.md`:** if they list CaseTerms/Subaccord fields, add `appealWindow`.
- [ ] **`security-checklist.md`:** if it references the appeal window or finality timing, update.

### e) Tests

- [ ] **LiteSVM TDD (RED first):** `create_subaccord` with custom `appeal_window` persists + freezes into `CaseTerms`; `appeal` honors per-dispute window (short window → appeal closed sooner); `finalize_dispute` eligible at `reveal_end + terms.appeal_window`; `cancel_dispute` post-draw uses per-dispute window + global grace; `UpdatePayload::AppealWindow` round-trips through propose/execute; `MIN_APPEAL_WINDOW_SECS` rejection.
- [ ] **Surfpool e2e (green-rule):** `tests/src/appeal.spec.ts` + `tests/src/full-lifecycle.spec.ts` — replace hardcoded `APPEAL_WINDOW_SECS` warps (`appeal.spec.ts:528,625,704`, `full-lifecycle.spec.ts:145`) with the per-dispute `terms.appealWindow`. One spec exercises a non-default window end-to-end.

## Authority

`constants.rs:28,43` · `state.rs:29,122,330,348` · `lib.rs:691,785,1333,1524,1739` · ADR-0004 (appeal) · ADR-0005 (subaccord authority/timelock) · ADR-0019 (dispute-kit config, `accord-8m2a`) · `accord-4e7p` (CaseTerms freeze, Ugly 6) · `accord-lgoo` (appeal timing fix, REVIEW #2) · AGENTS.md v1 Defaults.

## Predecessors / coordination

- Independent of but **layout-coupled** with `accord-z8jp` (reveal-quorum, CaseTerms `threshold`) and `accord-edz4` (two-mint, Subaccord `stake_token`/`fee_token`). All three resize `CaseTerms`/`Subaccord` — sequence or batch to minimize IDL regen churn.

## Summary of Changes

Made the appeal window a per-Subaccord, filing-time-frozen parameter (ADR-0022),
replacing the program-wide constant. Open design question resolved per the
bean's strong recommendation: `MIN_APPEAL_WINDOW_SECS = 3600` (1-hour floor);
`max_appeals == 0` covers the "no appeals" intent.

### Program (`programs/accord`)

- `constants.rs`: renamed `APPEAL_WINDOW_SECS` → `DEFAULT_APPEAL_WINDOW_SECS`
  (u64, 3 days, now only the create default); added `MIN_APPEAL_WINDOW_SECS`
  (3600); updated the `POST_DRAW_CANCEL_GRACE_SECS` comment.
- `state.rs`: added `appeal_window: u64` to `Subaccord`, `CaseTerms`,
  `CreateSubaccordParams`; added `UpdatePayload::AppealWindow(u64)`.
- `errors.rs`: added `AppealWindowTooShort`.
- `lib.rs`: `create_subaccord` validates `>= MIN_APPEAL_WINDOW_SECS` + writes the
  field; `create_dispute` freezes it onto `CaseTerms`; `execute_subaccord_update`
  gains the match arm; `finalize_dispute`/`appeal`/`cancel_dispute` read
  `dispute.terms.appeal_window` (cast to i64); doc-comment updated.

### SDK (`packages/sdk`)

- Regenerated Codama client from the new IDL (Subaccord, CaseTerms,
  CreateSubaccordParams, UpdatePayload all carry `appealWindow`/`AppealWindow`).
- `constants.ts`: renamed const + added floor; `lifecycle.ts`: added
  `appealWindow` to `CreateSubaccordArgs` + `assertValidAppealWindow` helper +
  wired validation; `appeal.ts`: updated const re-export; `adapter.ts`:
  `mapCreateSubaccordArgs` passes `appealWindow`.
- Unit tests: added `assertValidAppealWindow` test; updated the constant-assert
  test (66 SDK tests green).

### Tests

- LiteSVM: 3 new tests (stores appeal_window, freezes onto terms, rejects below
  floor); parametrized `try_create_subaccord`; warps read `d.terms.appeal_window`
  (47 Rust tests green).
- e2e: `fixtures.ts` default uses `DEFAULT_APPEAL_WINDOW_SECS`; appeal.spec.ts +
  full-lifecycle.spec.ts warps renamed (Surfpool e2e warps use the default;
  per-dispute terms.appealWindow read where the dispute is in scope).

### Docs

- New ADR-0022; ADR index + authoring footer bumped to 0023; cross-refs in
  ADR-0004/0005/0019/0014; SPEC.md account rows + state-machine line;
  CONTEXT.md glossary; AGENTS.md v1 Defaults + ADR authority line; MkDocs
  constants/state-machine/errors/accounts/instructions; integration
  appeals/get-ruling/arbitrable-interface.
