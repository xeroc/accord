---
"@useaccord/jurat": patch
---

Jurat hint layer: `SeatDrawn` log hints are now filtered to the operator's own juror key. When our seat lands, the daemon immediately logs + Telegram-alerts "duty received: seat N on dispute D (round R)" and kicks an off-cycle reconcile scan; foreign seats no longer trigger full scans.
