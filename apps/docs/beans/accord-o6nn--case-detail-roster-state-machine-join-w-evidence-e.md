---
# accord-o6nn
title: Case detail - roster + state machine + join w/ evidence editor
status: completed
type: task
priority: normal
created_at: 2026-08-18T19:14:12Z
updated_at: 2026-08-18T19:14:38Z
parent: accord-5fe9
blocked_by:
    - accord-1viq
---

State-machine view of SynodCase, roster with joined bits + countdown. Join flow: port apps/app evidence module (EvidenceEditor structured format + markdown + publishEvidence) adapted to synod keying - encrypt to operator, POST /evidence/synod/:case/:slot, then SDK join with the bundle hash (stake S transfer). Blocked by daemon ingest route (accord-1viq).

## Summary of Changes

- `@useaccord/sdk/evidence` gains `publishSynodEvidence` (ADR-0015 home — nothing hand-rolled in the app): claimant-encrypt + POST the standard ciphertext bundle to the daemon's pre-dispute route `POST /evidence/synod/{case}/{slot}`; shared wire body factored out of `publishEvidence` (`postBundle`).
- `features/case/joinFlow.ts` (canon challengeFlow pattern, synod keying): `buildJoinManifest` — manifest ctx `dispute := case PDA`, `filer := joining party`, labels = roster shorts + neutral; `joinEvidenceErrors` editor gates; `prepareJoinEvidence` (hash + publish) and `buildJoinInstruction` (party ATA + vault + `join`). TDD'd — 7 pure tests (keying, label bounds incl. padding slots, determinism, description-divergence).
- `features/case/JoinCard.tsx` — canon ChallengePage-shaped editor (title + markdown claim + entry list + YAML preview) rendered on case detail when the wallet is an unjoined party on an Opening case before the deadline; submit = publish → `join` via `useSynod().sendIx` → invalidate + toast; blocks on a Subaccord with no evidence operator. CaseDetailPage wires the card + join-deadline countdown (`timeRemaining`).

Verify: app lint ✅ build ✅ tests 60/60 ✅; SDK rebuilt (97/97) for the new export; browser smoke — all routes render, zero page errors; workspace build/lint/test exit 0 (packages built before apps — cranker's `@useaccord/synod` types need the dist present).
