---
# accord-9aoc
title: Case detail - dispute card + manual file/claim/refund + app tests
status: todo
type: task
created_at: 2026-08-18T19:14:12Z
updated_at: 2026-08-18T19:14:12Z
parent: accord-5fe9
---

Dispute status card + deep link to apps/app DisputeDetail (canon DisputeStatusCard pattern). Manual escape-hatch buttons: file_dispute (full roster), claim (own share), refund_roster_miss (deadline missed). Pure-logic tests canon-style (state machine, roster masks, fee previews); pnpm -r lint + build green.
