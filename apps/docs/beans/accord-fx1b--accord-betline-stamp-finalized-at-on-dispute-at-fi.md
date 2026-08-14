---
# accord-fx1b
title: Accord Betline — stamp finalized_at on Dispute at Final (reveal-window anchor)
status: completed
type: task
created_at: 2026-08-07T18:21:51Z
updated_at: 2026-08-14T21:30:00Z
---

Add finalized_at: i64 to Dispute (state.rs), 0 until Final. Stamp in finalize_dispute (single Final transition). Zero-init in create_dispute. Update LiteSVM + e2e tests. Needed by the Betline primitive: bettor reveal window opens at dispute Final and needs a canonical timestamp anchor Betline can read off-chain/on-chain. Minimal, surgical, no migration (Accord not deployed).

## Summary of Changes

- `Dispute` gains `finalized_at: i64` (`programs/accord/src/state.rs`); `0`
  until Final — safe sentinel, real on-chain Unix time is never 0.
- `create_dispute` zero-inits it (`lib.rs`); `finalize_dispute` stamps
  `finalized_at = now` at the single Final transition, alongside
  `final_ruling` / `state = Final`.
- Codama client regenerated (`finalizedAt` encoder/decoder in
  `packages/sdk/src/generated/accounts/dispute.ts`).
- LiteSVM (`accumulator_litesvm.rs`): asserts `finalized_at > 0` and
  `>= filed_at` after Final.
- e2e (`tests/src/appeal.spec.ts`): asserts `finalizedAt > 0n` and
  `finalizedAt >= filedAt` on the finalized dispute.
- Docs updated: `apps/docs/docs/reference/accounts.md` Dispute row,
  `.agents/skills/useaccord/references/06-voting.md` read example.
- No migration: Accord not deployed.

Verification: `cargo test -p accord --features no-entrypoint` 59/59
accumulator + canon suites green; jest e2e vs Surfpool — appeal.spec 4/4,
full suite green (canon.challenge `it.skip` is intentional, documented
in-code).

Landed in 1881df0 (program + tests + codegen + docs); this commit flips
the bean status.
