---
# accord-wgk7
title: Zero-commitment replay inflates commit_count, locks out honest jurors into no-show slashes
status: completed
type: bug
priority: normal
created_at: 2026-11-04T07:36:53Z
updated_at: 2026-11-04T07:50:50Z
---

Security review finding: commit.rs uses the all-zero slot as the uncommitted sentinel, but never rejects a SUBMITTED all-zero commitment. A drawn juror can submit [0;32] repeatedly — each passes the CommitAlreadyExists guard (slot stays sentinel), bumps commit_count, and at commit_count==juror_count flips the dispute to Reveal early. Honest jurors then cannot commit (InvalidState) nor reveal (CommitMissing) and are slashed as no-shows at redraw, their slash redistributed to coherent revealers (possibly the attacker). Fix: reject the all-zero commitment at the boundary with a dedicated guard so rejected calls leave counter+state unchanged; the sentinel stays unambiguous. Tests: zero commit rejected (counter/state unchanged), zero-replay + valid commit does not lock out the remaining panel.

## Summary of Changes

- `programs/accord/src/instructions/commit.rs` — `require!(commitment != [0u8; 32], ZeroCommitment)` before any state mutates; rejected calls leave `commit_count` + dispute state untouched.
- `programs/accord/src/errors.rs` — `ZeroCommitment` appended at the enum tail (codes sequential + stable; `SlotAwaitingRecycle` precedent — mid-enum insert would renumber every later error).
- LiteSVM RED→GREEN (replay genuinely succeeded pre-fix): `commit_rejects_all_zero_commitment_leaves_state_untouched`, `commit_zero_replay_cannot_flip_early_or_lock_out_panel` (the review's 3-juror lockout repro, neutralized).
- e2e `tests/src/voting.spec.ts` — `commit with the all-zero sentinel commitment reverts, round untouched (SR4-M-1)` via the raw `buildCommit` seam (the vote+salt facade can never produce a zero hash); GREEN on Surfpool.
- SDK: `make codegen` regenerated (`ACCORD_ERROR__ZERO_COMMITMENT = 6071`, zero renumbering — 6027/6057 pins intact), hand map entry in `packages/sdk/src/errors.ts`.
- Docs: `SPEC.md` commit row + `security-checklist.md` SR4-M-1 row; changeset `.changeset/quiet-jurors-guard.md`.
