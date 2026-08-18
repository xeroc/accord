---
# accord-1viq
title: Daemon - synod ingest route + pre-dispute grouping
status: todo
type: task
created_at: 2026-08-18T19:14:00Z
updated_at: 2026-08-18T19:14:00Z
parent: accord-7k2y
---

Implementation half of accord-ybuq (rewritten scope). POST /evidence/synod/:case/:party (slot 0-6, unauthenticated - join-committed hash IS the commit), storage grouped by case PDA + slot, 409 once dispute bound. Existing dispute-keyed routes untouched. See milestone accord-daq8 HANDOFF.
