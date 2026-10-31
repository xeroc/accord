---
"@useaccord/cranker": patch
"@useaccord/jurat": patch
---

Cranker: cut the juror-draw latency from ~2 poll cycles to seconds. A new
`VrfLogListener` subscribes to the Accord program's log stream and dispatches
the dispute the instant a `VrfCommitted` event lands (the deterministic draw
trigger — the account-write notification alone could be missed). Scoped
dispatches (account writes + VRF events) now ITERATE resolve→execute with
fresh state instead of ending on the first action: a stale snapshot that
resolves a now-skippable action no longer deadlocks the draw until the next
60s cycle, and concurrent dispatches for one dispute coalesce into one run.
`panelSizeForRound` now takes `dispute.terms.minJurySize` from chain instead
of assuming the default panel of 3 — N=1 pools (Inveigo arena court) no longer
burn sortition retries on phantom seats.

Jurat: review-phase duties schedule a wake at `reviewEnd + 1s` (new optional
`RuntimeDeps.scheduleWake`, wired to the daemon's off-cycle scan in main), so
evidence + LLM start the moment the commit window opens instead of on the
next scan tick (120s in deployment).
