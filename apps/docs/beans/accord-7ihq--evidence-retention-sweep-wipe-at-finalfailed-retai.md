---
# accord-7ihq
title: Evidence retention sweep — wipe at Final/Failed + retain_until
status: todo
type: task
created_at: 2026-09-22T13:28:29Z
updated_at: 2026-09-22T13:28:29Z
---

Follow-up to accord-5d0r (locked in grilling 2026-09-22): scheduled sweep polls disputes for Final/Failed + EVIDENCE_RETENTION_DAYS, wipes store prefixes {sa}/{dispute} (layout is sweep-friendly by construction; domains/ never touched). Compliance driver: passports/medical records must not outlive appeals. Not pilot-blocking (no 90-day-old pilot disputes exist).
