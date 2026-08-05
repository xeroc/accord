---
# accord-gh3k
title: Re-post snapshot after void (CONCEPT-REVIEW Ugly 3)
status: scrapped
type: task
priority: high
created_at: 2026-08-05T15:25:46Z
updated_at: 2026-08-05T16:20:23Z
parent: accord-ukqg
---

## Why

`post_snapshot` is `init` one-shot per round (PDA `["snapshot", dispute, round_idx]`,
`lib.rs:1911-1917`). After a successful challenge voids the snapshot
(`snap.status = Voided`, `lib.rs:713`), there is **no re-post path**. The dispute is
stuck in `SnapshotPosted` with a voided snapshot: the bad root can't be used, a new
root can't replace it, the dispute can't reach a jury, and the filer's fee stays
locked. An honest fraud challenge punishes the dishonest poster AND the filer and
every participant. Bean veridao-i4jm flagged this explicitly and it was deferred.
CONCEPT-REVIEW §Ugly 3 / conceptual blocker #6.

## How (agreed)

Add `repost_snapshot` (or extend `post_snapshot` to accept `status == Voided`):
close/overwrite the voided snapshot with a FRESH `anchor_slot = now`, fresh
`merkle_root`, fresh bond, fresh 1-day challenge window, and reset the dispute to
`Created`. Each repost is re-bonded and re-challengeable, so repeated
population-steering isn't free. The history-free anchor model still holds: a repost
uses a new anchor, and `last_change_slot < new_anchor` witnesses current stake.

Pairs with the escape-path task: if repost also fails repeatedly, the cancel path
applies. Fraud detection must improve integrity, not turn sabotage into permanent DoS.

## TDD acceptance

- Void a snapshot, then `repost_snapshot` succeeds with a new root + new bond +
  restarted 1-day window.
- The dispute reaches `Drawn` after repost + finalize + draw.
- `repost_snapshot` on a non-voided (Posted/Finalized) snapshot reverts.
- The voided-snapshot filer-fee-lock scenario is resolved (fee is recoverable via
  the dispute reaching a panel, or via cancel if repost also stalls).

## References

CONCEPT-REVIEW §Ugly 3; ADR-0008; `lib.rs:478-485`, `lib.rs:695-718`; beans
veridao-i4jm, veridao-rrxs. Amends ADR-0008.

## Reasons for Scrapping (2026-08-05)

Mooted by the on-chain stake accumulator (ADR-0012, bean accord-g74z). There is no posted snapshot, no void, and no challenge window to recover from — the root is canonical by construction. Re-post-after-void has no object to act on.
