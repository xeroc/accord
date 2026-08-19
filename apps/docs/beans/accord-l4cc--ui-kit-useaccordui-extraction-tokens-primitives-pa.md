---
# accord-l4cc
title: UI Kit — @useaccord/ui extraction (tokens, primitives, patterns, Storybook)
status: completed
type: milestone
created_at: 2026-08-19T04:04:18Z
updated_at: 2026-08-19T04:04:18Z
---

Extract shared design system per UI-KIT-PLAN.md: packages/ui with canonical tokens/theme/base CSS, shadcn primitives (Button/Dialog/Select/Alert/Badge/Card/Input/Separator/Skeleton/Toaster/Copyable/motion), slot-based patterns (ProductNavbar, PageShell, PageTransition, display-only DisputeStatusCard), Storybook 9 + vitest/RTL harness. Consumers: app, canon, synod migrated; landing tokens-only (Tailwind aligned 4.3.3). Verified: recursive build/lint/test green, CSS parity vs pre-migration baselines (0 real regressions), forbidden-import audit clean, tarball React-free.

- [x] Scaffold package (tsup, declarations, CSS copy, exports)
- [x] Canonical tokens.css/theme.css/base.css/styles.css
- [x] Primitives extracted, app duplicates deleted
- [x] Synod/canon/app migrations green
- [x] Storybook (44 stories) + 43 behavior tests
- [x] Patterns extracted with app adapters
- [x] Landing token-only integration, no React
- [x] shadcn ownership moved to packages/ui
- [x] CI storybook step + dep cleanup
