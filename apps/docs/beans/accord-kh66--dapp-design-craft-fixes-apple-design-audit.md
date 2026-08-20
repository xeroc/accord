---
# accord-kh66
title: ""
status: completed
type: task
priority: normal
created_at: 2026-08-20T15:51:19Z
updated_at: 2026-08-20T15:51:27Z
---



## Todos

- [x] Kit: EmptyState + ErrorState + useNow (tests first, RED→GREEN) + stories
- [x] Kit: reduced-motion base rule + muted-foreground token alias
- [x] App: queryClient singleton + invalidate-after-confirm in sendInstruction
- [x] App: replace hand-rolled buttons with kit Button
- [x] App: remove nested <main> shells (6 pages)
- [x] App: 1s appeal tick via kit useNow
- [x] App: unify page h1 scale + dialect

## Summary of Changes

Kit (`packages/ui`):

- New patterns `EmptyState` / `ErrorState` (promoted from apps/app where the same
  panels were pasted 8×/3×; tests + stories colocated, exported from index).
- `useNow(enabled, intervalMs)` hook added to `mechanism/clock.ts` (promoted
  from Voting.tsx; drives countdown windows in every Accord app).
- `base.css`: global `prefers-reduced-motion` rule collapsing CSS transitions/
  animations to instant swaps (hover lifts, press scales, collapsible heights).
- `theme.css`: `--muted-foreground` aliased to `--accord-text-secondary` —
  one secondary gray across both token dialects (apple-design audit H2/H3).

App (`apps/app`):

- C1: `shared/queryClient.ts` singleton; `sendInstruction` invalidates all
  queries (except immutable domain-doc) after a confirmed tx — appeal, commit,
  reveal, stake, withdraw now reflect on-chain state immediately. PublishEvidence
  additionally invalidates the manifest query after a successful publish.
- C2/C3: every hand-rolled button class string replaced with kit `Button`
  (incl. `asChild` Links) — press scale, focus-visible ring, loading states
  everywhere; ActionPicker toggles use `aria-pressed` outline Buttons.
- H1: six per-page `<main>` shells removed — one `<main>` per page (PageShell),
  no frame-width jump between routes (verified in-browser: 1 main, identical
  classes on /, /subaccords, /juror, /juror/stake).
- H4: appeal-window countdown ticks 1s via kit `useNow` (was 60s — stale
  eligibility up to a minute after window close); `getAppealInfo` receives the
  live `now`.
- H2: page h1s unified to `text-2xl font-semibold tracking-[-0.01em]`.

Verification: kit vitest 275/275 green (incl. new EmptyState/ErrorState/useNow
tests), kit build + lint green, app `tsc -b && vite build` green, app tests
37/37, live DOM audit across four routes.
