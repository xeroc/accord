---
# accord-k6us
title: Scaffold programs/canon (Anchor workspace + keypair)
status: todo
type: task
priority: high
created_at: 2026-08-07T23:00:46Z
updated_at: 2026-08-07T23:00:46Z
parent: accord-4y4i
---

Target: `programs/canon/` (new). Add as a workspace member in the root `Cargo.toml`; add `[programs.localnet] canon = <id>` to `Anchor.toml`; scaffold `src/lib.rs` (`declare_id!` + empty `#[program] mod canon`). Generate `target/deploy/canon-keypair.json` via `solana-keygen new`, then `anchor keys sync` to align `declare_id!`/`Anchor.toml`/keypair.
Change: stand up the empty Anchor program so `anchor build` emits `canon.so`.
Acceptance: `anchor build` compiles an empty `canon.so`; program ID is identical across `declare_id!`, `Anchor.toml`, and the keypair (AGENTS.md §Program ID gotcha). No instructions yet.
Dependencies: none. Authority: AGENTS.md (repo layout, program ID).
