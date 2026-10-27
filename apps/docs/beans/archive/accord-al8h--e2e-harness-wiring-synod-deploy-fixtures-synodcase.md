---
# accord-al8h
title: e2e harness wiring — synod deploy + fixtures (SynodCase)
status: completed
type: task
created_at: 2026-08-18T05:28:56Z
updated_at: 2026-08-18T05:28:56Z
parent: accord-ndl9
---

assigned: implementer
tests/src: extend setup/env.ts with the synod facade + programId (probe deploy, clear make run_surfpool hint); setup/fixtures.ts gains synod case fixtures (parties arrays, stake/fee math, evidence hash vectors) and the mint setup reuses setup/tokens.ts (fee_token mint + party ATAs). No copy-paste of RPC/payer boilerplate. Anchor.toml test path already deploys via Surfnet runbook — verify .so deploy of synod lands.

## Summary of Changes

- `runbooks/deployment/main.tx`: added `deploy_synod` action (mirrors `deploy_canon`) so the committed runbook carries synod alongside accord/canon.
- `tests/src/setup/env.ts`: `TestEnv.synodProgramId` + a Synod deploy probe in `createTestEnv` — fails fast with a redeploy hint instead of opaque per-spec errors. (The `Synod` facade client itself is NOT wired: `@useaccord/synod` doesn't exist yet — beans accord-8y6m/accord-nsxa are `todo`. The specs bean (accord-8pd1) wires `new Synod(...)` when the package lands; `SYNOD_PROGRAM_ID` is centralized in fixtures for a one-line swap.)
- `tests/src/setup/fixtures.ts`: synod section — `SYNOD_PROGRAM_ID`, `synodCasePda` (`["case", opener, nonce-u64-LE]`, codama convention), `synodOptionLabel` (`sha256("synod-opt" ‖ case_pda ‖ i_u8)`), `synodEvidenceHash` (`sha256(case_pda ‖ e_0..e_{N-1})`), `synodEconomics` (frozen fee, pot, neutral floor shares with last-claimant remainder, conservation-tested), `synodRoster`. Byte-level encodings are PINNED here; the program bean (accord-l2ad) must match SPEC §Instructions #3 against these vectors.
- `tests/src/setup/tokens.ts`: shared `ATA_PROGRAM_ID` + `ataOf(mint, owner)` (kills the per-spec `ata()` copy pattern; vault/party ATAs derive through it, balances via existing `setTokenBalance`).
- `tests/src/synod.fixtures.spec.ts`: pure KAT spec (offline-lane safe) — pinned sha256 vectors, PDA determinism, payout-math conservation across N=2..=7.

Verification: `anchor build --ignore-keys` emits synod.so (stub) + IDL; Surfpool auto-deploy upgrades program `5o5VDoAZ…` at the Anchor.toml address (verified live on a Surfnet); probe verified failing-fast pre-deploy; `tsc` clean; `pnpm -r lint/build/test` green for packages+apps; jest pure specs green; full jest suite 17/19 suites green against a borrowed Surfnet (remaining failures are known shared-state/time-warp flakiness on the contaminated net, none synod-related).

Environment note for accord-8pd1/ipja: this box's port 8899 (+ studio 18488) is held by the user's Mash project Surfnet. The localnet datasource in `txtx.yml` is self-referential (rpc_api_url 127.0.0.1:8899), so a self-contained Surfnet requires 8899 free — `anchor test`/`make test` will fork Mash's net until it is stopped. Custom-port instances cannot self-reference (verified: circular datasource failure). Also: the committed runbook never executes its actions under `surfpool start` — it WARN-fails on unresolved `input.rpc_api_url` (pre-existing, affects accord/canon identically); actual deploys come from Surfpool's target/deploy auto-deploy. My debug runs deployed accord/canon/synod program accounts onto Mash's Surfnet (disposable sandbox; PDAs from the jest run too).
