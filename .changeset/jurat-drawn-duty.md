---
"@useaccord/jurat": patch
---

Fix solo-panel duties never surfacing: `reconcile` now treats `DisputeState.Drawn` as actionable — on chain, `Drawn` IS the review phase (panel full, windows open; nothing ever writes `Review`, and the first panel `commit` flips `Drawn→Commit`). With a multi-juror panel another juror's commit eventually made the dispute visible; with a solo panel (`min_jury_size: 1`) nobody commits first, jurat idled through the commit window, and the dispute stalled into shortfall redraws. `runDuty` already holds through review and commits at window open, so the fix is the actionable-state set alone (bean accord-zhnh).
