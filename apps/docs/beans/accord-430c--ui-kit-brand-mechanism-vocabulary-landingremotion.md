---
# accord-430c
title: UI-kit brand + mechanism vocabulary (landing/remotion shared)
status: completed
type: feature
priority: normal
created_at: 2026-08-20T01:17:50Z
updated_at: 2026-08-20T01:35:29Z
---

Move the remotion video vocabulary into @useaccord/ui so the landing page and videos share one implementation. NO COMMIT — working tree only.

Extract to packages/ui:
- brand/accord-mark (the 3-line house mark; kills 4 hand-rolled copies: app navbar, landing Nav, landing Footer, remotion)
- brand/wordmark + amber-rule (progress-driven, static-capable defaults)
- brand/backdrop — pure function of a frame prop (ledger grid, juror field, verdict glow, vignette); port remotion's mulberry32 PRNG verbatim so node fields stay identical
- brand/clock — useWallClockFrame rAF driver (prefers-reduced-motion freeze) for browser consumers
- patterns/ juror-pool, sealed-vote, ruling-stamp, chips, tally — frame-PROP contract (no remotion hooks in kit)

Consumers:
- remotion: thin backdrop adapter + kit imports for brand/pieces (anim/Scene/Beat/rail/Coin stay local)
- landing: Nav/Footer mark, Hero backdrop (replaces static grid-texture), Mechanism section wall-clock mechanism strip
- apps/app navbar: swap to kit mark

Verify: kit vitest+lint+build-storybook, remotion test+lint+stills parity, landing build + browser smoke. TDD.

## Summary of Changes

**Kit (`packages/ui`)**
- `src/brand/` — `AccordMark` (THE 3-line house mark; static defaults, progress/dot for draw-on), `Wordmark`, `AmberRule`, `Backdrop` (pure function of a `frame` prop; PRNG = verbatim port of Remotion's mulberry32+hash so node fields are identical), `useWallClockFrame` (rAF clock, reduced-motion freeze, optional loop). Stories in `brand/index.stories.tsx`.
- `src/patterns/` — `JurorPool`, `SealedVote`, `RulingStamp`, `MonoChip`/`DeltaChip`, `TallyBar` with the frame-prop contract (no Remotion deps in the kit). Stories in `patterns/mechanism.stories.tsx` (scrubbable frame slider).
- `src/internal/motion-math.ts` — `tween`/`enterAt`/`easeExpo`/`linear` (2-point clamped tweens; motion's cubicBezier).
- Exports wired in `src/index.ts`; README documents the vocabulary + two recorded decisions (house-mark exception; frame-prop contract).

**Remotion** — `src/shell/backdrop.tsx` is now a 5-line adapter over the kit Backdrop; brand + mechanism pieces import from `@useaccord/ui` (scenes pass `frame`); deleted local brand/pieces modules (Coin stays, `src/pieces/coin.tsx`); README table updated.

**Landing** — Nav + Footer use kit AccordMark (was 2 of 4 hand-rolled copies); Hero runs the live Backdrop (replaced static `.grid-texture`); Mechanism section gained `MechanismStrip` — a 12s wall-clock loop (pool → draw → seal → reveal → tally → stamp), settled frame for reduced-motion.

**apps/app** — navbar swapped to kit AccordMark.

Verify: kit vitest 164/164 (unit + storybook-in-chromium; playwright chromium installed locally), lint + build clean; remotion 24/24, tsc clean, still-frame diff vs remotion-local build: 0.00–0.01% content-level drift (grid drift rate now fixed-period ambient); landing lint+build clean, browser smoke on built page: 26 hero nodes animating (grid 3.3px/s, field drifting), 30 strip dots, tally bars, RULING: YES stamp landed, 3-line marks in nav+footer, zero console errors; app lint+build clean.

**NOT COMMITTED** — per instruction; working tree holds 38 changed files.

## Amendment (2026-08-20, later)

AccordMark: center dot removed per Fabian — the mark is the three
converging lines only. `dot` prop dropped from the component, tests,
story, and both remotion scenes. Kit 91/91 + build clean; remotion
24/24 + tsc clean; still-frame diff: content-level change confined to
the 25×24 px focal box (the dot), nothing else moved. Still NOT
COMMITTED.

## Amendment 2 (2026-08-20, later still)

Storybook restructure: the mechanism vocabulary now has per-component
entries (component-bound metas, args-driven `frame` with range
controls, named state stories) — Patterns/SealedVote (5),
JurorPool (3), RulingStamp (4), TallyBar (3), Chips (3) — and the
composite is retitled "Patterns/Mechanism playground" pointing at the
per-component entries. Sidebar index verified in a fresh
build-storybook; full kit suite 47 files / 181 tests, exit 0 (one
earlier run showed 34 invalid-hook-call errors — parallel-chromium
flake, not reproducible). Still NOT COMMITTED.

## Amendment 3 (2026-08-20, later still)

SealedVote layout bug (Fabian caught on the landing): text taller than
the chip border. Root cause: base layout was the schelling fixed slot
(all children inside an absolute inset-0 wrapper), so the chip variant's
h-auto collapsed the box to padding-only — text overflowed. The earlier
intro-2 parity still sampled frame 600 (bams scene) and never exercised
a chip; wrong frame, my miss.

Fix: hash span is now in-flow; container centers it (flex
items-center justify-center); only the vote/tone overlays stay
absolute. Chip layouts size to their text; the h-14 slot centers
identically. Regression test added (hash must stay in flow). Verify:
kit 92/92 + lint + build; landing browser measure — chips 50px tall,
28px text fits inside on all three; schelling slot stills vs kit-era:
0.000–0.010% strong (sub-pixel). Still NOT COMMITTED.

## Amendment 4 (2026-08-20, evening)

Drawn-juror / sealed-vote count consistency + composite code in
Storybook (Fabian):

- The cast is now the single source of truth everywhere the pieces
  co-appear: `DRAWN_DOTS` is DERIVED from the juror cast (never
  hand-counted) in the Mechanism playground, JurorPool's Drawn/Retired
  stories, and the landing MechanismStrip — 5 jurors drawn = 5 sealed
  votes = tally 4:1 (matches the schelling-court narrative).
- Playground Docs now show the composite usage code via
  parameters.docs.source.code (Storybook's dynamic extraction only
  shows `<ScrubDemo />` for render-fn stories). Verified present in the
  built storybook-static manifests.

Verify: kit 47 files / 182 tests exit 0, lint+build+build-storybook
clean; landing rebuilt; browser check under emulated reduced-motion
(deterministic settled frame): 5 chips, 5 amber dots, numbersMatch
true, tally YES·4 / NO·1, stamp opacity 1. Mid-loop sample showed the
tally growing and chips fitting. Still NOT COMMITTED.

## Amendment 5 (2026-08-20, evening)

Module split per taxonomy discussion (Fabian approved): new
`src/mechanism/` = the frame-contract vocabulary (JurorPool,
SealedVote, RulingStamp, TallyBar, chips, AND Backdrop + the
useWallClockFrame driver + the ported PRNG now in internal/);
`src/brand/` = identity only (AccordMark, Wordmark, AmberRule);
`src/patterns/` = chrome composites only (Navbar, Shell, Transition,
DisputeStatusCard) with the README paragraph corrected (no longer
claims domain-neutrality). Storybook regrouped to match: Mechanism/*,
Brand/Identity, Patterns/*. Backdrop got its own component-bound entry
(Live + FrozenFrame) split out of the identity story. Public API names
unchanged — consumers untouched. Kit 48 files / 183 tests exit 0,
dist + storybook builds clean, sidebar verified; remotion tsc + tests
and landing lint/build green against the rebuilt dist. Still NOT
COMMITTED.
