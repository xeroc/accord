---
"@useaccord/ui": patch
"@useaccord/landing": patch
---

Landing: new "Machine jurors, on duty" section presenting Jurat, the
open-source AI juror operator, between Heritage and Audience. Four
capability cards (reads every page / minutes not weeks / abstains never
guesses / open source, dry-run by default), a four-beat duty progress
strip (READ → ADJUDICATE → COMMIT → REVEAL — each box fills to amber
over 3s, reduced motion settles all four), and a full-width operator
band with kit Button CTAs to the repo and ADR-0036.
Copy law: defensible capability claims only, no traction claims.

UI kit: vendored the free-tier reui components `icon-tile` and `frame`
(radix-nova registry variant, installed via `shadcn add @reui/...` into
`src/components/reui/`, imports repointed to the kit's own `cn` util —
no new dependencies). Retheming is zero-CSS: the components read the
shadcn semantic tokens that theme.css already maps onto the accord
palette. Stories included (ReUI/Icon Tile, ReUI/Frame).
