---
# accord-om41
title: Landing jurat section — present the AI juror
status: completed
type: milestone
priority: high
created_at: 2026-11-09T09:31:02Z
updated_at: 2026-11-09T09:49:13Z
---

## Design decisions (grilling 2026-11-09)

| Decision | Resolution |
|---|---|
| Placement | New section on `/` between Heritage and Audience |
| Audience | Dual, integrator-first (proof of machine verdicts + operator band) |
| Claims | Defensible wording only — no "all-knowing"/"neutrality" titles |
| Visual | Vendor real reui components (develop MCP) into packages/ui as source, retheme to tokens |
| CTA | Text links to github.com/xeroc/accord + docs/ADR-0036 |
| Motion | Compact duty strip: SCAN → READ → VERDICT % → COMMIT → REVEAL → RULING (film kit) |

## HANDOFF

### 1. Happy Path
1. Visitor scrolls: Heritage → Jurat section (cards + duty strip) → Audience
2. Integrator reads capability claims; operator follows repo link

### 2. Data Contract
- New: apps/landing/src/components/Jurat.tsx; vendored components exported from packages/ui/src
- Modules: packages/ui (tokens + new source), apps/landing/src/App.tsx (section order)

### 3. Edge Cases & Constraints
- Integrity law: no traction claims; wording stays defensible ("reads every page", "abstains, never guesses", "minutes not weeks")
- Reduced-motion: strip settles (matchMedia pattern from MechanismStrip)
- No speculative deps — vendored set = exactly what the section uses
- reui blocks are pro-locked; free path = 27 components + c-* examples unless user supplies license

### 4. Business Logic
Section renders cards from a static array; strip beats driven by useWallClockFrame({fps:30, loopFrames:360})

### 5. Definition of Done
- [ ] pnpm -r build + lint green
- [ ] Browser visual pass on / (incl. reduced motion)
- [ ] Changeset added
- [x] Vendored components have Storybook entries

### 6. Test Matrix
- Given /, When scrolled to jurat section, Then cards + strip render, CTAs resolve
- Given prefers-reduced-motion, When strip mounts, Then settled frame (no loop)

### 7. Open Questions
- reui pro license for premium blocks? (free path default)


## Summary of Changes

- Vendored reui `icon-tile` + `frame` (radix-nova, free tier) into
  `packages/ui/src/components/reui/`; imports repointed to the kit's `cn`
  (dropped the `cn` npm dep the CLI added). Zero-CSS retheme via theme.css
  semantic tokens. Stories: ReUI/Icon Tile, ReUI/Frame (a11y-clean; story
  canvases scope FrameHeader banners inside a section like real usage).
- New `apps/landing/src/components/Jurat.tsx` (§6) between Heritage and
  Audience; section ordinals rebumped (Audience §7, FinalCTA §8). Duty strip
  reuses the film kit (useWallClockFrame/SealedVote/RulingStamp); reduced
  motion settles at LOOP-20 (verified via emulateMediaFeatures).
- lucide-react added to landing deps (same range as the kit).
- Changeset: .changeset/landing-jurat-section.md (ui + landing, patch).
- Verification: ui tsc+vitest (325 tests), landing tsc+vite build, storybook
  build, DOM/style/a11y pass on dev server (no violations from #jurat; the
  two axe findings in Footer/Mechanism pre-date this change).
