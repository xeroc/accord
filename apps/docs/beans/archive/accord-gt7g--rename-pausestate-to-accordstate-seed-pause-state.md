---
# accord-gt7g
title: Rename PauseState to AccordState + seed pause->state
status: completed
type: task
priority: normal
created_at: 2026-08-14T18:11:24Z
updated_at: 2026-08-14T18:58:10Z
---

Full rename of the pause singleton in accord (user decision: devnet reset accepted, discriminator NOT pinned): type PauseState -> AccordState, Accounts-struct fields pause_state -> accord_state, seed value b"pause" -> b"state" (PDA moves - devnet re-init required), const SEED_PAUSE -> SEED_ACCORD_STATE. Instruction names (initialize_pause/pause/propose_unpause/execute_unpause) and event names (Paused/UnpauseProposed/Unpaused) STAY (discriminators). Ripples: accord lib.rs/state.rs/constants.rs, canon challenge_item CPI field + litesvm fixture, accord litesvm tests (incl. literal b"pause" in pause_litesvm), IDL+codegen, hand-written SDK (lifecycle.ts SEED bytes [115,116,97,116,101], adapter, facades, exports), jest specs, docs (accord SPEC, security-checklist, root README mainnet checklist rewritten: seed rename DONE pre-mainnet, preps = redeploy + re-init + re-stake).

## Summary of Changes

- accord program: `PauseState` → `AccordState` (state.rs), `SEED_PAUSE` → `SEED_ACCORD_STATE` = `b"state"` (constants.rs), all `pause_state` accounts-struct fields → `accord_state` (lib.rs: initialize_pause/pause/propose_unpause/execute_unpause/stake/create_dispute/appeal). Instruction + event names unchanged (discriminators pinned). New discriminator accepted (no pin — devnet reset).
- New `programs/accord/src/pda.rs`: single-source PDA derivation helpers (`dispute_pda`/`subaccord_pda`/`accord_state_pda`) — the cross-program wire contract Canon's CPI + LiteSVM tests now use; seed bytes pinned by unit test.
- IDL + codegen regenerated (`make codegen`): `pauseState` → `accordState` across generated accounts/pdas/instructions/programs; SDK facades (pda.ts, fetch.ts, adapter.ts, methods.ts, lifecycle.ts incl. SEED bytes [115,116,97,116,101], staking.ts, appeal.ts, dispute.ts), index exports.
- Consumers migrated: apps/cli (lifecycle + read:pause-state + staking-context + stake/appeal/dispute commands), apps/cranker (reconciler, util, execute-unpause crank), apps/app, apps/canon challengeFlow, @useaccord/canon methods extras, jest specs, accord+canon LiteSVM tests, docs (README, AGENTS.md, apps/docs reference/security, security-checklist, .agents/skills/useaccord refs).
- PDA moved: devnet requires redeploy + re-run initialize_pause + re-stake. README mainnet-readiness note updated to record the rename as done pre-mainnet.
