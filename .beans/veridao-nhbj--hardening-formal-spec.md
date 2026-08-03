---
# veridao-nhbj
title: Hardening & Formal Spec
status: todo
type: epic
priority: normal
created_at: 2026-08-03T23:09:55Z
updated_at: 2026-08-03T23:09:55Z
parent: veridao-rlno
blocked_by:
    - veridao-pxr5
---

Security audit pass + formal verification scaffold.

## Tasks

- [ ] Apply safe-solana-builder security checklist (shared-base sections as applicable); document High-Risk Decisions (admin keys, upgrade authority, irreversible transitions)
- [ ] Create `programs/accord/accord.qedspec`; regenerate formal_verification dir (AGENTS.md Beans)

## Acceptance

Checklist fully applied with file:line findings; qedspec covers invariants (slash math, distinct draw, bond conservation, active_draws balance).
