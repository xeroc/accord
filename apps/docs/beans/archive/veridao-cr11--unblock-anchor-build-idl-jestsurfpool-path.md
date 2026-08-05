---
# veridao-cr11
title: Bump anchor 0.31.0 -> 1.0.2 (unblocks IDL + jest/Surfpool)
status: completed
type: task
priority: high
created_at: 2026-08-04T01:45:56Z
updated_at: 2026-08-04T16:20:32Z
---

## REWRITTEN SCOPE (2026-08-04 — supersedes content above)

Going with option (b) at full scope: bump anchor 0.31.0 -> 1.0.2 (not just toolchain pin). 1.0.2 is where active maintenance lives, ships Solana 3.0 deps, and its bundled platform-tools should resolve the cargo 1.84 / edition2024 block by default — so the `--tools-version v1.52` workaround in the Makefile should also become deletable.

Original problem (for posterity): `cargo build-sbf` worked with `--tools-version v1.52` (cargo >=1.85), but `anchor build` was blocked — it resolved deps with the bundled cargo 1.84, which couldn't parse `block-buffer 0.12.x`'s `edition2024` manifest (pulled by `solana-program -> blake3 -> digest 0.11`).

### Target version matrix

| Component                    | From    | To                                                     |
| ---------------------------- | ------- | ------------------------------------------------------ |
| anchor-lang / anchor-spl     | 0.31.0  | 1.0.2                                                  |
| anchor-litesvm               | 0.1     | 0.4 (tracks anchor 1.x; the 0.1 line was the 0.31 pin) |
| solana-program / solana-sdk  | 2       | 3                                                      |
| spl-associated-token-account | 6       | 8                                                      |
| spl-token                    | 7       | 9                                                      |
| Solana CLI (Makefile pin)    | 1.18.20 | 3.1.10                                                 |
| Anchor CLI (Makefile pin)    | 0.31.0  | 1.0.2                                                  |
| @coral-xyz/anchor (TS)       | ^0.31.0 | @anchor-lang/core ^1.0.2 (renamed)                     |

### Mechanical changes

- [x] Cargo.toml (workspace): bump anchor-lang/anchor-spl to 1.0.2; add solana-program = "3"
- [x] programs/accord/Cargo.toml: bump anchor-litesvm 0.1->0.4, solana-program/sdk 2->3, spl-ata 6->8, spl-token 7->9; add idl-build feature
- [x] Anchor.toml: delete [registry] section (removed in 1.0, #4299)
- [x] Makefile: SOLANA_VERSION 1.18.20->3.1.10, ANCHOR_VERSION 0.31.0->1.0.2
- [x] Makefile: --tools-version v1.52 flag still needed for bare cargo build-sbf (Solana CLI < 3.x); NOT needed for anchor build
- [x] tests/package.json + packages/sdk/package.json: swap @coral-xyz/anchor -> @anchor-lang/core, bump ^1.0.2
- [x] avm install 1.0.2 && avm use 1.0.2

### Audit items (real risk)

- [x] Duplicate mutable accounts now disallowed by default (#3946) — NO ERRORS; no duplicate mutable accounts in any Accounts struct
- [x] CPI context no longer carries program account info (#2762) — Fixed: 10 CPI calls changed .to_account_info() -> .key()
- [x] anchor build runs end-to-end (IDL generation unblocked — the original blocker) — VERIFIED
- [x] make test_unit green (anchor-litesvm 0.4 API: .request() removed from builder chain) — 78 tests pass

### Docs

- [x] AGENTS.md "Toolchain note" — rewritten (anchor build unblocked; cargo build-sbf still needs flag with Solana < 3.x CLI)
- [x] programs/accord/Cargo.toml comment on anchor-litesvm — rewritten
- [x] AGENTS.md "Gotchas" — Program ID note updated (anchor keys sync, no longer hand-provisioned)
- [x] Anchor.toml comment — stale "blocked" comment removed by anchor 1.0 restructure

### Additional fixes (discovered during bump)

- [x] hashv imports: anchor_lang::solana_program::hash no longer re-exported (Solana crate split); added solana-program as direct dep, use solana_program::hash::hashv
- [x] anchor-litesvm 0.4 API: .request() removed from builder chain; 68 occurrences deleted across 11 test files
- [x] Test compilation: added #![cfg(feature = "no-entrypoint")] gate to all \*\_litesvm.rs files (prevents entrypoint symbol conflict during anchor build's IDL step)
- [x] solana_program::system_program::ID → anchor_lang::system_program::ID (11 occurrences, Solana crate split)
- [x] BPF stack overflow: Boxed vault/subaccord in ChallengeSnapshot, FinalizeSnapshot, Appeal (anchor 1.0 try_accounts slightly larger frame)
- [x] Program ID sync: declare_id! was hand-set to wrong address; anchor keys sync corrected to match keypair (RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe)

### Blocker for

jest/Surfpool e2e harness, IDL generation, SDK client generation — ALL UNBLOCKED.

## Summary of Changes

Bumped anchor 0.31.0 -> 1.0.2 across the full monorepo. `anchor build` now runs end-to-end: produces the .so, the IDL (target/idl/accord.json), and TypeScript types (target/types/accord.ts). The original blocker (cargo 1.84 / edition2024 manifest parse failure) is resolved for the anchor build path.

### What changed

**Dependencies** (Cargo.toml + programs/accord/Cargo.toml):

- anchor-lang/anchor-spl 0.31.0 -> 1.0.2
- anchor-litesvm 0.1 -> 0.4 (tracks anchor 1.x)
- solana-program/sdk 2 -> 3, spl-token 7 -> 9, spl-ata 6 -> 8
- Added solana-program as direct dep (hashv moved out of anchor re-export)
- Added idl-build feature (required by anchor 0.30+)

**Program code** (programs/accord/src/lib.rs):

- 10 CPI calls: token_program.to_account_info() -> token_program.key() (#2762)
- 3 hashv imports: anchor_lang::solana_program::hash::hashv -> solana_program::hash::hashv
- 3 BPF stack overflow fixes: Boxed vault/subaccord in ChallengeSnapshot, FinalizeSnapshot, Appeal
- declare_id! synced to keypair via anchor keys sync

**Test code** (programs/accord/tests/\*.rs):

- 68 .request() calls removed (anchor-litesvm 0.4 API change)
- 11 solana_program::system_program::ID -> anchor_lang::system_program::ID
- All \*\_litesvm.rs files gated with #![cfg(feature = "no-entrypoint")]

**Config**:

- Anchor.toml: [registry] removed (anchor 1.0), program ID synced
- Makefile: SOLANA/ANCHOR versions bumped, toolchain note updated
- TS packages: @coral-xyz/anchor -> @anchor-lang/core ^1.0.2
- AGENTS.md: toolchain note + gotchas rewritten

### Verification

- `anchor build` — clean, produces .so + IDL + types (zero errors)
- `make test_unit` — 78 tests, 0 failures
