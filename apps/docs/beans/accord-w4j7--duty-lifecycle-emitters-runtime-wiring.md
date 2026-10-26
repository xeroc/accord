---
# accord-w4j7
title: Duty-lifecycle emitters + runtime wiring
status: todo
type: task
created_at: 2026-10-23T09:32:58Z
updated_at: 2026-10-23T09:32:58Z
parent: accord-c19g
---

RuntimeDeps.trace?: TraceSink; emit duty-open (round, seat, windows) at tracking, evidence (paths+sha256+bytes) after intake, sealed verdict (unsealAt = round.revealEnd, or omitted in open mode), commit/reveal (tx sig / dryRun), abstain (kind, reason). Wire RemoteTraceSink in main.ts. RED→GREEN with a fake sink: full mock-duty run emits the HANDOFF §1 sequence; DRY_RUN path emits commit{dryRun:true}; abstain path emits abstain; trace failure never fails the duty.
