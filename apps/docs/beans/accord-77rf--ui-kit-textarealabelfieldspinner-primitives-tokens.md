---
# accord-77rf
title: 'UI Kit: Textarea/Label/Field/Spinner primitives + Tokens story, refactor apps off hand-rolls'
status: completed
type: feature
priority: normal
created_at: 2026-08-19T18:08:31Z
updated_at: 2026-08-19T18:44:51Z
---

Add missing kit primitives with TDD (Textarea, Label+Field, Spinner + Button loading prop), Foundations/Tokens story, then migrate every app off hand-rolled textareas/labels/fields/spiners/hex tokens onto the kit.

## Summary (2026-08-19 — complete)

### Kit (TDD: RED → GREEN)

- [x] Textarea, Label, Spinner, Field scaffolded via shadcn CLI (radix-nova), imports fixed to package-relative, trimmed to consumed surface.
- [x] Field: context + **FieldControl** (single-child clone with id/aria-describedby/aria-invalid) + FieldLabel/FieldDescription/FieldError. Storybook axe caught that a page-level `useField()` reads the empty default context — FieldControl is the canonical API. `useId()` sanitized to `[a-zA-Z0-9-]` for axe's `label[for]` selector.
- [x] Button `loading` prop: kit Spinner (aria-hidden) + aria-busy + disabled; asChild-safe.
- [x] Foundations/Tokens story reads computed `:root` values — cannot drift from tokens.css.
- [x] New exports: `Label, Field{,Control,Description,Error,Group,Label}, useField, Spinner, Textarea`.
- Kit suite: 35 files / 129 tests green (incl. chromium axe per story); tsc clean; build-storybook green.

### Apps — zero hand-rolls remain

- [x] All 3 hand-rolled textareas → kit Textarea (CreateDispute, ChallengePage, JoinCard).
- [x] ~30 hand-rolled label/field blocks → Field/FieldLabel/FieldControl/FieldDescription/FieldError across app/canon/synod/landing; local Field wrappers in SubaccordCreatePage + CreateListPage + NewCasePage rewritten onto the kit (call sites unchanged).
- [x] Native selects (Voting, Aggregation, DepthPicker) → kit Select.
- [x] Spinner hand-roll (StakePage) deleted; pending buttons → `Button loading` (Voting, StakeActions, CreateDispute, ChallengePage, SubmitItemPage, Waitlist).
- [x] Token purge: `stateColor()` var-strings → `text-confirm/text-slash/text-amber` classes; all `style={{ color: var(--amber) }}` → token classes; `fontWeight:650`→`font-semibold`; caption `fontSize` → `text-xs`; page h1s `text-[1.6rem]`→`text-2xl` (16 files); canon h1 conflicting class bug fixed.
- Deliberately kept: `✕` remove buttons + ring-styled Links (no Button equivalent); layout-only inline styles (skeleton sizing, grid widths); `tracking-[-0.01em]` optical tuning.

### Verification

- `pnpm -r run build` + `pnpm -r run lint` green workspace-wide; kit vitest 129/129.
- Guards: no raw `<label`/`<textarea`/`animate-spin`, no color/font inline styles, no `var(--amber|green|red…)` in any app TSX.
