---
# accord-k6us
title: Scaffold programs/canon (Anchor workspace + keypair)
status: completed
type: task
priority: high
created_at: 2026-08-07T23:00:46Z
updated_at: 2026-08-08T02:32:00Z
parent: accord-4y4i
---

Target: `programs/canon/` (new). Add as a workspace member in the root `Cargo.toml`; add `[programs.localnet] canon = <id>` to `Anchor.toml`; scaffold `src/lib.rs` (`declare_id!` + empty `#[program] mod canon`). Generate `target/deploy/canon-keypair.json` via `solana-keygen new`, then `anchor keys sync` to align `declare_id!`/`Anchor.toml`/keypair.
Change: stand up the empty Anchor program so `anchor build` emits `canon.so`.
Acceptance: `anchor build` compiles an empty `canon.so`; program ID is identical across `declare_id!`, `Anchor.toml`, and the keypair (AGENTS.md §Program ID gotcha). No instructions yet.
Dependencies: none. Authority: AGENTS.md (repo layout, program ID).

## Summary of Changes

- Added `programs/canon` to the root `Cargo.toml` workspace `members`.
- Added `[programs.localnet] canon = GYvMBmzi6w2PPuK8tPGnnNsVprzWeNBecete3Jp6aeKU` to `Anchor.toml`.
- Scaffolded `programs/canon/Cargo.toml` (minimal: `anchor-lang` + `idl-build` feature, mirroring the accord crate shape) and `programs/canon/src/lib.rs` (`declare_id!` + empty `#[program] mod canon`, no instructions).
- Generated `target/deploy/canon-keypair.json` via `solana-keygen new`; ran `anchor keys sync` → "All program id declarations are synced" (no drift). The keypair is committed (force-added, mirroring the accord keypair — the `/target` gitignore rule blocks descent, so negations can't re-include it; AGENTS.md §Program ID gotcha).
- Verified: `anchor build --ignore-keys` emits `target/deploy/canon.so` (57 KB) + `target/idl/canon.json` (0 instructions) + `target/types/canon.ts`. Program ID `GYvMBmzi6w2PPuK8tPGnnNsVprzWeNBecete3Jp6aeKU` is identical across the keypair pubkey, `declare_id!`, `Anchor.toml`, and the IDL `address`. `cargo fmt` clean; `cargo clippy` clean for canon-authored code (only the ecosystem-wide `anchor-debug` cfg warning from anchor-lang's macro remains, identical to accord's 28 instances).
