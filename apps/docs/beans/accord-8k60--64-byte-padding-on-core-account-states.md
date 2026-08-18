---
# accord-8k60
title: 64-byte padding on core account states
status: completed
type: task
priority: normal
created_at: 2026-08-18T14:59:58Z
updated_at: 2026-08-18T15:53:28Z
---

Append zeroed 64-byte padding to Subaccord, JurorStake, Dispute, AppealBond, AccordState for future extension. InitSpace derives sizes automatically. Round (zero_copy pinned layout) + PendingUpdate untouched.

## Summary of Changes

- programs/accord/src/state.rs: trailing padding: [u8; 64] on the five structs (+ Dispute test literal).
- programs/accord/src/tests.rs: layout-test literals carry padding (offsets_match_borsh green — existing offsets pinned unmoved).
- programs/accord/tests/accumulator_litesvm.rs: fabricated AppealBond 93→157 bytes.
- packages/sdk/src/generated/*: codama regen (padding codecs).
- apps/cranker reconciler.test.ts + state.test.ts: dispute() fixtures carry padding.
- apps/evidence-daemon accordStub.ts: defaults completed (padding + previously-missing minJurySize/coherenceTolBps/freeHead — those were silently zero-encoding before).
- programs/accord/SPEC.md: account-model note on the reserved tail space.

Verification: cargo unit + 6 LiteSVM suites green; workspace lint/build green; packages/sdk 97, evidence-daemon 185, cranker/cli/app/canon tests green; jest e2e 18 suites / 65 tests green vs a fresh offline Surfnet (8905) with the rebuilt accord+canon .so deployed. Not committed (no commit requested; sibling agent active in tree).
