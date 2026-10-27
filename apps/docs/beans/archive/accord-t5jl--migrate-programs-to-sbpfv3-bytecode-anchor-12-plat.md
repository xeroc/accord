---
# accord-t5jl
title: Migrate programs to sBPFv3 bytecode — anchor 1.2 + platform-tools v1.57
status: completed
type: feature
priority: normal
created_at: 2026-09-21T09:59:43Z
updated_at: 2026-09-21T14:16:36Z
---

SIMD-0500 (Agave v4.4) will reject new deployments/upgrades of sBPFv0-v2 bytecode. Migrate the workspace: anchor-cli/anchor-lang 1.2.0 (defaults --arch v3 --tools-version v1.57), solana CLI 3.1.10, solana-program 3.x graph (solana-define-syscall >= 3 everywhere), Anchor.toml [toolchain] + Makefile pins, CI workflows (program-tests.yml/tests.yml). Verify: readelf CPU Version 3 on all three .so, make codegen + pnpm -r build, full LiteSVM + Surfpool suite green.

## Progress

- [x] Toolchain: avm 1.2.0 active, agave-install 3.1.10 (agave 3.x renamed solana-install → agave-install; Makefile prep updated)
- [x] Cargo.toml: anchor-lang/anchor-spl 1.0.2 → 1.2.0 (moves syscall surface to solana-define-syscall ≥ 3)
- [x] Anchor.toml [toolchain]: anchor 1.2.0 / solana 3.1.10 — this is what CI extract-versions reads
- [x] Makefile: ANCHOR_BUILD_FLAGS := --ignore-keys --arch v3 --tools-version v1.57 + make verify-sbf (readelf e_flags guard) wired into build + test
- [x] program-tests.yml: ANCHOR_BUILD_SBF_ARCH=v3 env + post-test readelf guard (versions flow from Anchor.toml)
- [x] AGENTS.md: prep/build/toolchain-note/ignore-keys sections updated
- [ ] Build all three programs as sBPFv3, readelf → Flags: 0x3
- [ ] make codegen (codama ^1.10 vs anchor 1.2 IDL) + pnpm -r run build
- [ ] make test (LiteSVM + Surfpool e2e) green

## Summary of Changes

- Toolchain: anchor-cli/anchor-lang/anchor-spl 1.0.2 → 1.2.0 (defaults + explicit `--arch v3 --tools-version v1.57`), agave 3.1.10 (note: `solana-install` → `agave-install` in 3.x), platform-tools v1.57 (rustc 1.95.0-dev).
- **Blocker found:** ephemeral-rollups-sdk 0.16.2 unconditionally bundled a renamed `solana-program <3` (`solana-program-compat`, define-syscall 2.3, extern-"C" syscalls) into the program ELF — cannot link as sBPFv3 (no runtime relocations). Bumped to 0.17.2 where the plain `anchor` feature resolves solana-program 3.x only. ELF graph now define-syscall {3.0, 4.0.1}.
- Anchor.toml [toolchain] → anchor 1.2.0 / solana 3.1.10 (drives CI via solana-foundation extract-versions).
- Makefile: `SBPF_ARCH`/`SBPF_TOOLS`/`ANCHOR_BUILD_FLAGS` pins + `make verify-sbf` (readelf e_flags guard) wired into build + test.
- program-tests.yml: `ANCHOR_BUILD_SBF_ARCH: v3` env + post-test readelf guard step.
- canon: removed 2 glob re-exports unused under anchor 1.2 codegen (`propose_court_update::*`, `update_list::*`; cpi + idl-build features verified compiling); added missing `anchor-spl/idl-build` to canon's idl-build feature.
- AGENTS.md: prep/build/toolchain-note/ignore-keys sections updated.

## Verification

- `make verify-sbf`: all three `.so` → `Flags: 0x3, CPU Version: 3`
- Host unit + LiteSVM: EXIT=0, all suites green
- `make codegen`: Codama output byte-identical (no SDK churn); `pnpm -r run build` green
- Surfpool e2e (`anchor test`): **26/26 suites, 114/114 tests passed** against the deployed v3 ELFs

## Deployment note

Program IDs unchanged; next `anchor program deploy` ships sBPFv3 ELFs. Mainnet-beta already accepts v3. Upgrade before SIMD-0500 activates in Agave v4.4 (v0–v2 deploys/upgrades/finalizations rejected after).
