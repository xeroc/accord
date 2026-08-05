---
# veridao-1lvm
title: Provision canonical Accord deploy keypair (RokLJyruq) or add local program-id override for integration tests
status: todo
type: task
priority: normal
created_at: 2026-08-05T01:19:55Z
updated_at: 2026-08-05T02:18:12Z
parent: veridao-5y8e
---

Blocker C for veridao-7iiv (discovered session 2). anchor build generates a mismatched deploy keypair (5oV81KLt...) because the canonical keypair for RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe is absent from the worktree. The program ID is baked into declare_id!, Anchor.toml, the committed Codama client (packages/sdk/src/generated/programs/accord.ts), and packages/sdk/src/pda.ts (ACCORD_PROGRAM_ID). Without the canonical keypair the program cannot be deployed at the address the SDK targets, blocking every integration test that issues a real instruction. Options for the operator: (1) provision target/deploy/accord-keypair.json whose pubkey is RokLJyruq... (the originally-provisioned secret), OR (2) add a local program-id override mechanism to the SDK (Accord config + Codama regen path) so local tests can target a freshly-generated keypair without touching the canonical ADR-level program ID. (1) is preferred — keeps the SDK as-is. Unblocks the non-VRF slice of veridao-7iiv.

## Decision

Since this is a development branch and worktree, we do not need to worry about
deployment. The tests can be run using anchor --ignore-keys flag to skip this check.
