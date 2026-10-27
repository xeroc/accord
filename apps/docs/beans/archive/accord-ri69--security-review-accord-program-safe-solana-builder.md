---
# accord-ri69
title: Security review — Accord program (safe-solana-builder audit)
status: completed
type: task
priority: normal
created_at: 2026-08-19T00:50:29Z
updated_at: 2026-08-19T01:04:21Z
---

Full security review of programs/accord against safe-solana-builder + solana-security checklists. Deliverable: ./reports/ findings. No git commit.

## Summary of Changes

- Full manual review of programs/accord (31 instructions, ~6.2k LOC) against safe-solana-builder (shared-base + anchor) and solana-security checklists.
- Report written to `reports/2026-08-19-accord-security-review.md` (no code changes, no commit).
- Findings: 3 High (reclaim_slot missing pending_withdrawal gate -> permanent fund lock; pre-draw cancel optional partial-round probe -> jurors locked forever; create_subaccord skips update-path domain bounds), 5 Medium (Median zero-reveal fabrication at bps=0, frozen-root ineligible-leaf deadlock, initialize_pause frontrun, SAS attestation no address/revocation binding, settle pool vs realized-slash divergence), 6 Low/Info.
- Verified-sound: sortition collision re-roll, MST accumulator, CaseTerms freeze, two-mint ledger, checked math, layout pin tests.
- Suggested follow-up beans: fix H-1/H-2/H-3 + M-1 (each TDD: red test first).
