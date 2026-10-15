---
# accord-5mpb
title: Failure path — abstain & alert
status: todo
type: task
created_at: 2026-10-15T07:32:42Z
updated_at: 2026-10-15T07:32:42Z
parent: accord-ji4v
---

src/duty/failures.ts: after retry ladder exhaustion or malformed verdict: mark duty abstained, Telegram alert with reason, no default vote ever. AC: unit tests every failure source maps to abstain+alert.
