---
# accord-h5nx
title: Scalar voting — u64 votes, Median aggregation, bps coherence band (full-site)
status: completed
type: milestone
priority: normal
created_at: 2026-08-17T20:58:40Z
updated_at: 2026-08-17T22:44:10Z
---

## Summary of Changes

Scalar voting landed end-to-end (ADR-0025): u8→u64 widening across the entire site + Median aggregation + bps coherence band + u64::MAX sentinels everywhere incl. cranker/CLI/app.

Program: Aggregation::Median; coherence_tol_bps (u16, default 100) on Subaccord/CaseTerms/CreateSubaccordParams (immutable, frozen at filing); Round re-laid out (u64 result/reveals, reveals @ struct 2576); final_ruling/prior_result u64; reveal gates per aggregation; commit preimage hash(vote_le8||salt||juror); finalize_round median tally (even n = upper middle, test-pinned); settle coherence = exact (Plurality) | bps band in u128 (Median); get_ruling Option<u64>; events u64.

Tests: 4 new litesvm scalar tests; new e2e scalar.spec.ts; full jest suite 65/65 GREEN twice on one Surfnet; fixed pre-existing draw.spec fixed-nonce idempotency bug; Rust 14+63+canon green.

SDK: bigint commitHash (72B preimage, pinned vector), NO_VOTE/NO_RULING sentinels, encode/decodeScalarVote, aggregation-aware option validation, coherenceTolBps threading — 97/97. CLI 119/119 (--vote string + --decimals, --aggregation/--coherence-tol-bps, optional --options for scalar filing). Cranker 56/56. App 25/25 (aggregation-aware UI, scalar commit form). canon-app sentinels.

Docs: ADR-0025 + index, accord+canon SPECs, docs site, README, AGENTS, .agents/skills, qedspec note.

Gates: pnpm -r lint clean, pnpm -r build clean, cargo test green, jest e2e green x2.
