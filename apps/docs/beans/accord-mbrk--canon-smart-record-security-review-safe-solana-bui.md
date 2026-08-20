---
# accord-mbrk
title: Canon smart-record security review (safe-solana-builder)
status: completed
type: task
priority: normal
created_at: 2026-08-19T00:54:53Z
updated_at: 2026-08-19T00:58:31Z
---

Full security review of programs/canon per safe-solana-builder skill. Reports to ./reports/canon/. Known input: draft bean accord-69pd (settle_item UncheckedAccount payout redirect). No code changes, no commits.

## Summary of Changes

Review-only; no code changes, no commits (per instruction).

- Read the full canon surface: lib.rs, state.rs, errors.rs, constants.rs, events.rs, all 6 instruction handlers, SPEC.md, all 6 LiteSVM test files, canon e2e specs, Accord contracts consumed (Dispute::ruling, Subaccord::filing_fee, DisputeState/Failed semantics), workspace Cargo profile.
- Baseline verified: cargo test -p canon --features no-entrypoint — 20/20 green.
- Wrote reports/canon/security-review.md (14 findings: 1 Critical, 1 High, 3 Medium, 7 Low, 2 Info + verified-secure section + test-gap list) and reports/canon/security-checklist.md (skill-format applied checklist, risk 🔴 Critical, High-Risk Decisions, pre-deploy blockers).
- Key results: C-1 settle_item UncheckedAccount payout theft (confirms draft accord-69pd, severity raised); H-1 no Failed-dispute path — SPEC.md:148-150 documents behavior the code does not have (AGENTS docs-match-reality violation); M-1/M-2 create_list param bounds + zero challenge_stake; M-3 legacy-token-only.
- Follow-up beans to create on fix kickoff: C-1 fix (fold into accord-69pd), H-1 Failed path + SPEC edit, M-1/M-2 bounds, I-2 canon-in-CI wiring.
