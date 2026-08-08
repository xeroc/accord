---
# accord-ewj8
title: Dispute detail view (state machine + timeline + ruling)
status: todo
type: task
priority: normal
created_at: 2026-08-07T23:09:25Z
updated_at: 2026-08-07T23:10:49Z
parent: accord-sdtj
---

Fetch dispute by address + current round. Display: subaccord, filer, state machine (Created → Drawn → Review → Commit → Reveal → RoundResolved → Final → Closed), option hashes (hex in Plex Mono), frozen VRF status, fee paid, appeal bond info. If state=Final: show finalRuling verdict (amber highlight on winning option). If state=RoundResolved + within appeal window: show appeal button. Embed commit/reveal voting UI (juror task accord-7mkb) when juror is drawn.
