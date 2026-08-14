---
# accord-isfo
title: Rename accord_pause_state to accord_state + mainnet checklist
status: completed
type: task
priority: normal
created_at: 2026-08-14T17:53:14Z
updated_at: 2026-08-14T17:55:31Z
---

Rename the identifier accord_pause_state -> accord_state. Discovery: it exists in exactly ONE place — programs/canon/src/instructions/challenge_item.rs as a local binding for remaining_accounts[1] (Accord PauseState passed to the create_dispute CPI) + 3 comment mentions. It is NOT a seed (real seed: SEED_PAUSE=b"pause", constants.rs:86), NOT an IDL/SDK surface — a local rename cannot break deployed code. Add a root-README 'Mainnet readiness' subsection under Deployment listing everything to re-evaluate before the first mainnet deploy (including the seed rename b"pause"->b"accord_state" which would move the PauseState PDA).

## Summary of Changes

- programs/canon/src/instructions/challenge_item.rs: local binding accord_pause_state -> accord_state (remaining_accounts[1]) + the 3 comment mentions (doc header, remaining_accounts slot map, CPI wiring). The accord-side CPI struct field pause_state: is accord's API and stays.
- README.md: new 'Mainnet readiness — re-evaluate before the first mainnet deploy' subsection under Deployment (seeds incl. SEED_PAUSE rename, program IDs/keypairs, account layouts, wire format, open sentinels, protocol constants, VRF identity, audit sign-off).
- Verified: cargo fmt --check clean; cargo test -p canon --features no-entrypoint green; make test green (17/17 suites, 64 passed, 1 pre-existing env-gated skip). Zero IDL/seed/wire impact (local-variable rename only).
