---
# veridao-cr11
title: Unblock anchor build (IDL + jest/Surfpool path)
status: draft
type: task
created_at: 2026-08-04T01:45:56Z
updated_at: 2026-08-04T01:45:56Z
---

Cargo build-sbf works with --tools-version v1.52 (cargo >=1.85), but anchor build (needed to generate the IDL and to run the jest/Surfpool integration suite via anchor test) is still blocked: it resolves deps with the bundled cargo 1.84, which cannot parse block-buffer 0.12.x's edition2024 manifest (pulled by solana-program -> blake3 -> digest 0.11). Discovered while wiring the LiteSVM harness (veridao-8ys4).

Options to evaluate: (a) point anchor/avm at a cargo >=1.85; (b) bump the repo's Solana/Anchor toolchain so platform-tools ships cargo >=1.85 by default; (c) pin/patch the RustCrypto edition2024 crates out of the graph. Until resolved, the LiteSVM path (make test_unit) is the only working Rust test path, and the jest/Surfpool suite cannot run.

Blocker for: the jest/Surfpool e2e harness, IDL generation, and SDK client generation.
