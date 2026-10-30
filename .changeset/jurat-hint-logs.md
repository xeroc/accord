---
"@useaccord/jurat": patch
---

jurat: every WS hint event that triggers an action now logs an INFO line naming the event and its identifying accounts — `SeatDrawn` (our seat) logs juror + dispute (+round/seat), `SubaccordCreated` logs the subaccord, `DisputeCreated` logs dispute + subaccord, `Redrawn` logs dispute + round. Foreign `SeatDrawn` seats stay silent (no action, no log).
