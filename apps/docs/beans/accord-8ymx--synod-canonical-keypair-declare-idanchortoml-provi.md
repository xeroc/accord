---
# accord-8ymx
title: Synod canonical keypair + declare_id/Anchor.toml provisioning
status: completed
type: task
created_at: 2026-08-18T05:28:20Z
updated_at: 2026-08-18T07:50:00Z
parent: accord-l2ad
---

assigned: implementer
Generate the canonical synod keypair under multisig control (same drill as accord/canon — AGENTS.md Gotchas), update declare_id! in programs/synod/src/lib.rs and Anchor.toml [programs.localnet] from the scaffold placeholder 5o5VDoAZ…, remove the placeholder ponytail comment. Do NOT run anchor keys sync. Verify: anchor build --ignore-keys succeeds and the IDL carries the canonical ID. See milestone accord-oylq HANDOFF §3 (canonical keypair BEFORE first build).

## Summary of Changes

- Generated the canonical synod keypair via `solana-keygen new --no-bip39-passphrase` → `GdV5rbRd579LUs3zB2PkbBsJNCMSj55rwWdikGuobHeC`. Custody follows the accord/canon drill: the secret lives untracked at `target/deploy/synod-keypair.json` in the main checkout (`~/projects/Accord/accord`, alongside `accord-keypair.json`/`canon-keypair.json`), replacing the `anchor new` placeholder `5o5VDoAZ…` that previously occupied that path; mirrored into this worktree's `target/deploy/`. Never committed — repo policy since `8eac1b7 "chore: commit to a program id"` is commit-to-ID, keypair outside git.
- `programs/synod/src/lib.rs`: `declare_id!` → `GdV5rbRd579LUs3zB2PkbBsJNCMSj55rwWdikGuobHeC`; removed the placeholder ponytail comment.
- `Anchor.toml` `[programs.localnet]`: `synod` → canonical ID (localnet only, mirroring canon; no devnet entry).
- Did NOT run `anchor keys sync` (bean directive; AGENTS.md gotcha).

### Verification

- `anchor build --ignore-keys` green: `target/deploy/synod.so` (57 KB) emitted.
- `target/idl/synod.json` carries `"address": "GdV5rbRd579LUs3zB2PkbBsJNCMSj55rwWdikGuobHeC"`; `declare_id!` unchanged post-build.
- Repo-wide grep: zero remaining `5o5VDoAZ…` references (Anchor.toml + lib.rs were the only two).
