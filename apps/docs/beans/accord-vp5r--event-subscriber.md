---
# accord-vp5r
title: Event subscriber
status: todo
type: task
created_at: 2026-10-15T07:32:41Z
updated_at: 2026-10-15T07:32:41Z
parent: accord-24o6
---

src/chain/events.ts — SubaccordCreated / SeatDrawn / Redrawn / DisputeCreated discriminators + borsh decode, best-effort handlers never kill the subscription (evidence-daemon pattern). AC: unit tests decode real-shaped logs; malformed log swallowed+logged.
