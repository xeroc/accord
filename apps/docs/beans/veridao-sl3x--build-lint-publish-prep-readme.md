---
# veridao-sl3x
title: Build, lint, publish prep + README
status: todo
type: task
priority: normal
created_at: 2026-08-04T21:52:11Z
updated_at: 2026-08-04T21:52:57Z
parent: veridao-5y8e
blocked_by:
    - veridao-7iiv
---

Finalize the package. `make lint` + `make sdk` green. Verify package.json exports/dist/types, files field, README documenting the Accord facade + Arbitrable CPI API (create_dispute/get_ruling). Confirm src/generated/ is committed and `make codegen` is idempotent. Acceptance: clean build from scratch (make codegen -> make sdk -> make lint); README covers the public API. See ADR-0010 DoD.
