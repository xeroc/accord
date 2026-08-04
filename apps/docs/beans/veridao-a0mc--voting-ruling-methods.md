---
# veridao-a0mc
title: Voting & ruling methods
status: todo
type: task
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-04T21:51:58Z
parent: veridao-gqzm
---

src/methods/voting.ts: commit (with CLIENT-SIDE hash helper sha256(vote_byte | salt[32] | juror_pubkey[32])), reveal, finalize_round, finalize_dispute. Unit-test the commit hash against known vectors. Acceptance: commit hash verifies on-chain after reveal; finalize_* crank methods build. See ADR-0010 + test matrix row 2.
