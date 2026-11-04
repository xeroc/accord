---
"@useaccord/evidence-daemon": minor
---

Subaccord-scoped trace reads. Dispute PDAs are cluster-agnostic (same program
IDs on every cluster), so a devnet and a mainnet dispute can share one address
under different courts — the old dispute-keyed read merged both cycles into one
record (a week-old devnet HOLD verdict replayed into a live mainnet fight, and
the (juror, seq) client dedup shadowed the real verdict). `GET /trace/{dispute}`
and `WS /watch/{dispute}` now REQUIRE `?sub=<subaccord>` and serve exactly that
court's record; the filer-token mint moves to `POST /trace-token/{subaccord}/{dispute}`
with tokens scoped to (subaccord, dispute); the public stamp is re-keyed to
`traces-public/{subaccord}/{dispute}`. Unscoped reads fail 400.
