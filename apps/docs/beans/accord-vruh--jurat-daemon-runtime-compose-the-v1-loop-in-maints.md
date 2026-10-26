---
# accord-vruh
title: Jurat daemon runtime — compose the v1 loop in main.ts
status: completed
type: task
priority: normal
created_at: 2026-10-16T07:50:31Z
updated_at: 2026-10-16T08:26:41Z
parent: accord-em5q
---

The v1 pipeline modules all landed and are unit-tested, but src/main.ts was never composed beyond boot (skeleton bean accord-sozc scoped it to config+chain client). The e2e spec wires the pipeline ad-hoc by import, so the milestone closed green while pnpm dev boots, prints one line, and idles.

Wire the daemon loop (SPEC duty-flow diagram):

- file-backed DutyStore/VoteStore in src/state/
- adapters over the SDK (ReconcileChain, JoinChain, ChainReaders)
- scan handler: join candidates -> gates -> join executor (logged), duties -> tracker -> verdict -> commit -> reveal with the SPEC failure policy (ladder exhausted/malformed = abstain now; evidence = hold until window close)
- WS hint layer -> off-cycle scan; periodic reconcile as truth
- config additions: JURAT_STAKE_AMOUNT (required), JURAT_SCAN_INTERVAL_MS, JURAT_MIN_SOL_LAMPORTS, JURAT_EVIDENCE_URL + JURAT_DELIVERY_KEY_PATH (both-or-none, unset = verdict pipeline dark + boot warning)
- SPEC/README/.env.example updates

## Summary of Changes

- Diagnosis: every v1 pipeline module (reconcile, join gates/executor/book, duty tracker, evidence, agent ladder, vote, notify) landed and was unit-tested, but no bean ever scoped the composition — src/main.ts was still the skeleton boot line, and the e2e spec composed the pipeline by import, so the milestone closed green while 'pnpm dev' did nothing.
- src/runtime.ts: handleScan (join candidates → evaluateJoinGate with book + live balance ctx → executor, every decision logged) + runDuty state machine (review waits; commit → evidence → verdict → commitVote; ladder-exhausted/malformed → abstain now; evidence unavailable → hold; reveal → revealVote; window closes → abstain window-closed; crash between commit-send and duty-save heals) + runDaemon loop (boot scan, interval, kick-able by WS hints, abortable).
- src/state/stores.ts: file-backed DutyStore (duties.json) + VoteStore (votes.json), atomic tmp+rename writes.
- src/main.ts: full wiring over the SDK (findAllSubaccords/findAllDisputes/fetchRound/fetchDispute adapters, JoinChain adapter, telegram-or-stdout channel, ladder runner, optional evidence intake with delivery-key registration via noble Ed25519 over the operator key, subscribeAccordEvents hints, SIGINT/SIGTERM shutdown).
- Config: JURAT_STAKE_AMOUNT (required, boot-checked ≤ subaccord cap), JURAT_SCAN_INTERVAL_MS (60s), JURAT_MIN_SOL_LAMPORTS (50M), optional JURAT_EVIDENCE_URL + JURAT_DELIVERY_KEY_PATH (both-or-none; unset = duties hold, join watch runs, boot warns).
- Tests: 18 runtime tests (join decisions + full duty state machine incl. dry-run hold / live re-commit / heal paths), 4 store tests, config additions — jurat suite 173 green, tsc + eslint clean.
- Verified live against devnet: boots, scans 20 subaccords, logs per-pool gate decisions (AlphaTooHigh / InsufficientReserve), re-scans every interval.
- Docs: SPEC module map + config table now match the implemented env names; README status + quickstart updated; .env.example carries the new knobs.
