---
"@useaccord/cranker": patch
"@useaccord/jurat": patch
---

Verdict latency batch (devnet 2026-11-06 profile, dispute 54q6wQox — 209.9s attack→settle, 73% polling overhead):

- cranker: a WS trigger coalesced into an in-flight scoped dispatch that settles without acting now chains one fresh re-resolve instead of dying with it (live cost: `draw_seat` +38.5s waiting for the 60s poll when the `VrfCommitted` trigger coalesced into a failing duplicate `request_vrf` run)
- cranker: `resolveNextAction` returns `{ kind: "wait", until }` for time-gated disputes (voting windows, appeal window) and the reconciler arms a one-shot wake that runs a scoped dispatch at gate-open (live cost: `finalize_dispute` +21s past a 10s appeal window under poll-only phasing)
- jurat: our `SeatDrawn` hint schedules read-settle re-kicks (+1.5s, +4s) — the immediate kick races the RPC read replica, and a 0-duty scan at +450ms previously fell through to the 120s timer (live cost: duty pickup +45s)
