---
# accord-0z7c
title: Remotion shared video vocabulary
status: completed
type: feature
priority: normal
created_at: 2026-08-20T00:40:32Z
updated_at: 2026-08-20T00:54:17Z
---

Extract elements repeated across videos/v* into the apps/remotion framework so videos stop hand-rolling them.

Decisions (Fabian, 2026-08-20):
- Accord mark = the 3-line glyph (app navbar geometry) — replaces the 4-corner ConvergenceGlyph in videos. Consistency is mandatory.
- All videos use the richer shared Backdrop (src/shell/backdrop.tsx); schelling-court fork deleted.
- NO packages/ui changes — this branch never merges to develop; kit changes would be unusable.

Extract:
- src/shell/anim.ts — enterAt/exitAt/since/scramble/clamp (kills ~85 inline clamped EASE_EXPO interpolations)
- src/shell/brand.tsx — AccordMark (3-line), Wordmark, AmberRule
- src/shell/scene.tsx — Scene wrapper (Backdrop+stack), Beat chrome
- src/shell/rail.tsx — StepRail, PhaseCaptions
- src/pieces/ — JurorPool, SealedVote, RulingStamp, MonoChip/DeltaChip, TallyBar, Coin

Migrate _template, _example, and the 3 local videos. TDD; verify with still-frame diffs per video.

## Summary of Changes

- `src/shell/anim.ts` (+ `anim.test.ts`, 13 tests) — `enterAt`/`exitAt`/`since`/`scramble`/`clamp`; the sanctioned motion math. Killed ~85 hand-rolled clamped EASE_EXPO interpolations across all videos.
- `src/shell/brand.tsx` (+ 9 tests) — `AccordMark` (THE 3-line mark, navbar geometry — replaces the 4-corner ConvergenceGlyph), `Wordmark` (enter/settle/className), `AmberRule`.
- `src/shell/scene.tsx` — `Scene` (Backdrop + centered stack) and `Beat` (mechanism step chrome).
- `src/shell/rail.tsx` — `StepRail` (labels + amber fill) and `PhaseCaptions`.
- `src/shell/cn.ts` — clsx+tailwind-merge (added as direct deps); override-safe className merging for all pieces.
- `src/pieces/` — the Accord mechanism vocabulary: `JurorPool`, `SealedVote` (commit→reveal, tone, cross-out), `RulingStamp` (lg/md sizes), `MonoChip`/`DeltaChip` (amber/confirm/slash/neutral), `TallyBar`, `Coin`.
- Migrated `_template`, `_example`, and all three local videos; deleted intro's local `anim.ts`/`glyph.tsx` and schelling's backdrop fork (all videos now on the richer shared Backdrop).
- README: "Shared vocabulary" section (table + presentational contract).

Decisions applied (Fabian): 3-line mark everywhere; richer shared Backdrop for all videos; packages/ui untouched (branch never merges to develop).

Verify: `pnpm test` 33/33, `pnpm lint` clean. Still-frame diffs base vs after: intro-mech + intro2-mech 0.00% (pixel-perfect); intro-reveal 0.09% confined to the 120×120 mark box (intentional swap); schelling frames faint full-frame drift only (backdrop swap, no foreground change); example gained the unified backdrop + p-16 reflow.
