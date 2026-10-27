---
# accord-soh8
title: Canon app — list-page propose/challenge wiring + humanized item times
status: completed
type: feature
priority: normal
created_at: 2026-08-18T19:06:23Z
updated_at: 2026-08-18T19:06:28Z
---

The list detail page could display items but offered no actions: the submit form (/lists/:address/submit) and challenge form (/items/:address/challenge) existed but were orphaned (no inbound links; the only challenge link lived in an unrouted duplicate page). Wire both flows into the list page and add per-state humanized time rows to item cards.

- [x] Propose item CTA on list detail header → /lists/:address/submit
- [x] Per-card Challenge link for challengeable states (Pending/Listed/WithdrawPending per SPEC §Instructions #4), outside the card link (no nested <a>)
- [x] Challenge CTA on the routed ItemDetailPage (said Challengeable anytime with no action)
- [x] Shared CHALLENGEABLE_STATES table in apps/canon/src/shared/format.ts + exhaustiveness test
- [x] timeAgo helper + per-state ItemTimeStat row (Pending: lists-in countdown; Disputed: challenged-ago; WithdrawPending: unlocks-in; Listed/Removed: submitted-ago — no on-chain listed_at/removed_at)
- [x] apps/canon build green, 30/30 tests pass
