---
# accord-0yxb
title: Seal-on-read + unseal flush
status: todo
type: task
created_at: 2026-10-23T09:32:58Z
updated_at: 2026-10-23T09:32:58Z
parent: accord-0xih
---

One predicate `sealVisible(ev, now)` used by ALL read paths (WS live send, WS replay, REST). Per sealed frame a timer at unsealAt re-fans-out to live subscribers. RED→GREEN per HANDOFF §6: verdict withheld on every path while now < unsealAt (fake timers), delivered + timer-flushed after. No path may bypass the predicate.
