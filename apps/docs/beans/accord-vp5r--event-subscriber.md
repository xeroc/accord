---
# accord-vp5r
title: Event subscriber
status: completed
type: task
created_at: 2026-10-15T07:32:41Z
updated_at: 2026-10-15T11:15:00Z
parent: accord-24o6
---

src/chain/events.ts — SubaccordCreated / SeatDrawn / Redrawn / DisputeCreated discriminators + borsh decode, best-effort handlers never kill the subscription (evidence-daemon pattern). AC: unit tests decode real-shaped logs; malformed log swallowed+logged.

## Summary of Changes

- `apps/jurat/src/chain/events.ts` — WS log-subscription hint layer, mirroring the evidence-daemon `chain/events.ts` pattern:
  - Tracks the four milestone events with hard-coded Anchor discriminators (`sha256("event:<Name>")[0..8]`; `DisputeCreated` bytes cross-checked against the daemon's): `SubaccordCreated` (join-gate wake-up), `DisputeCreated`, `SeatDrawn` (seat assigned — composition filters `juror === ourKey`), `Redrawn` (panel redrawn — prior seat hints stale).
  - Kit struct decoders over the exact on-chain borsh layouts (programs/accord events.rs field order): `decodeAccordEvent` (never throws; null on unknown discriminator / short payload), `parseAccordLog` (`Program data: <base64>` lines; malformed base64 → null), `parseAccordLogs` (full log set, log order), `dispatchAccordEvent` (best-effort routing; handler throws are swallowed and surfaced via `onError`), `subscribeAccordEvents` (Kit `logsNotifications({mentions:[programId]})` loop, abortable; channel-fatal errors reject the returned promise, reconcile remains the catch-up path).
- `apps/jurat/src/chain/events.test.ts` — 12 tests: fixtures are real log shapes (`Program data:` + base64 of discriminator‖borsh, hand-built bytes) decoded through the production Kit decoders — one per event kind, multi-event log set ordering, non-event lines ignored, malformed base64 / unknown discriminator / truncated-payload-under-known-discriminator all swallowed to null, handler routing per kind, and throwing-handler survival via `onError`.

Verification: `bun test` 53/53 green (events + gates + executor + reconcile + book), `tsc --noEmit` green.
