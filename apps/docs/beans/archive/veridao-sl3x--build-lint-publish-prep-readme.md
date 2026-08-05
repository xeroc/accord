---
# veridao-sl3x
title: Build, lint, publish prep + README
status: completed
type: task
priority: normal
created_at: 2026-08-04T21:52:11Z
updated_at: 2026-08-05T03:25:00Z
parent: veridao-5y8e
---

## Summary of Changes

- **`packages/sdk/README.md`** — documents the Accord facade, Arbitrable CPI API
  (`create_dispute` / `fetchDisputeMaybe` for `get_ruling`), all eight method
  groups, PDA helpers, client-side crypto (commit hash, MST, panel resolution),
  and the build-from-source path (`make codegen` / `make sdk` / `make lint`).
- **`package.json`** — already had correct `exports`/`types`/`files` fields;
  no changes needed (`dist` + `README.md` in `files`).
- **`src/generated/`** — 55 files committed; `make codegen` confirmed idempotent
  (zero diff after regen).

### Verification (clean build from scratch)

```
make codegen  → Codama output byte-identical to committed tree
make sdk      → tsc build green
make lint     → SDK typecheck green
```

All ADR-0010 DoD items for package finalization are met.
