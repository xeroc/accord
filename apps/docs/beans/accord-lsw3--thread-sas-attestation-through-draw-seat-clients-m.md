---
# accord-lsw3
title: Thread SAS attestation through draw_seat clients + meaningful error
status: completed
type: task
priority: normal
created_at: 2026-10-12T08:56:31Z
updated_at: 2026-10-12T09:59:43Z
---

draw_seat.rs gained a defense-in-depth SAS re-check (remaining_accounts[1] on gated pools) but SDK drawSeat/CLI draw:seat+draw:submit-panel/cranker never pass it — gated draws revert InvalidPanelSize. Split the on-chain count require so the gated branch throws AttestationMissing (reuse existing error), thread attestation through SDK drawSeat + adapter + CLI flags + submit-panel/cranker discovery (findSasAttestation getProgramAccounts+memcmp), LiteSVM + SDK + e2e tests.

## Scope

- [x] Diagnose: SDK drawSeat/CLI/cranker never pass the attestation → gated draws revert #6027 InvalidPanelSize (red herring)
- [x] draw_seat.rs: split the remaining-accounts count require — gated → AttestationMissing (#6057, reused), ungated → InvalidPanelSize
- [x] SDK: drawSeat/buildDrawSeat/adapter optional `attestation` (read-only remaining_accounts[1]); methods.ts passthrough
- [x] SDK: `findSasAttestation` (queries.ts) — content discovery via getProgramAccounts memcmp (credential@33, schema@65, wallet@101, min len 173); SAS_PROGRAM_ID exported
- [x] CLI: `draw:seat --attestation`; `draw:submit-panel` auto-discovers per seat on gated pools, aborts with remediation hint when missing
- [x] Cranker: draw_seat crank resolves gate once + attestation per seat; missing → skip log naming prune_juror as remediation
- [x] Tests: LiteSVM gated-draw (revert name + happy path), SDK vrf.attestation.test.ts, e2e attestation.spec (2 new cases incl. discovery), CLI help test
- [x] Docs: SPEC.md draw_seat row, skill 05-vrf-draw.md, changeset

## Design decisions

- Reused `AttestationMissing` — exact semantic fit, no new error variant, no codegen churn.
- Attestation address is content-discovered, not derived (SAS nonce is a free seed; Accord reads by address — mirrors the e2e's fabricated-address reality). `findSasAttestation` = one getProgramAccounts scan with 3×32B memcmp + dataSize 173.
- CLI `draw:seat` keeps the explicit `--attestation` flag (mirrors staking:stake); composite paths (submit-panel, cranker) auto-discover per seat.
- Cranker skips (not retries) a juror with no attestation — drawing would revert forever; prune_juror is the remediation.

## Summary of Changes

- programs/accord/src/instructions/draw_seat.rs — gated/ungated require split
- programs/accord/tests/attestation_litesvm.rs — gated-draw RED→GREEN cases + DrawEnv harness
- packages/sdk: methods/vrf.ts, adapter.ts, methods.ts, queries.ts (findSasAttestation + SAS_PROGRAM_ID), index.ts; dist rebuilt
- apps/cli: commands/draw/seat.ts (--attestation), commands/draw/submit-panel.ts (gated discovery), test/commands/draw/seat.test.ts
- apps/cranker: src/cranks/accord/draw-seat.ts (gate + per-seat discovery + skip log)
- tests/src/attestation.spec.ts — 2 new e2e cases + armDrawDispute/resolveSeat0 helpers + rootSum getter
- SPEC.md, .agents/skills/useaccord/references/05-vrf-draw.md, .changeset/sas-attestation-draw-seat.md
- Verified: make test_unit (23 suites, 0 fail), full e2e 26/26 suites 117 pass (incl. new #6057 + discovery cases), SDK 116, CLI 157, cranker 99, tsc/eslint clean across sdk/cli/cranker/tests.

## Follow-up fixes (first devnet run, 2026-10-12)

- `findSasAttestation` exact `dataSize: 173` filter silently excluded real 205-byte SAS accounts (RPC dataSize is EXACT match; the minimal-layout mirror is 32 bytes short). Dropped — the credential/schema/wallet memcmps are the contract. Verified live: juror attestation `9k35Egx1…` (205B, disc 2) found; panel completed → dispute `BTkdQf…` now `Drawn 3/3`.
- `AccordErrors` map regenerated from the IDL (was 24 variants short → misnamed codes; 6027 printed "CommitAlreadyExists"). Entries now bind to generated `ACCORD_ERROR__*` constants; `errors.test.ts` pins the binding (RED→GREEN: InvalidPanelSize 6027, AttestationMissing 6057).
- `draw:submit-panel --from-seat N` resumes partially-drawn panels (draw_seat enforces `seat == juror_count`); seat labels now print actual seat numbers.
- SDK test glob quoted (`node --test 'src/**/*.test.ts'`) — shell globstar was off, silently skipping every root-level test file; rotted `query.test.ts` fixture repaired to the current JurorStake layout (discriminator + nextFree/prevFree + padding).
- CLI `infra.test.ts` error-code pins corrected to the true on-chain codes (they encoded the drifted map).
- Suites: SDK 137 pass, CLI 158 pass (16 in infra), cranker 99, e2e 26/26 suites 117 pass.
