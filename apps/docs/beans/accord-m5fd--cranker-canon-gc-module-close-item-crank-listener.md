---
# accord-m5fd
title: Cranker — canon GC module (close-item crank, listener + GPA sweep, dedup)
status: todo
type: task
priority: normal
created_at: 2026-08-14T19:06:45Z
updated_at: 2026-08-14T19:07:16Z
parent: accord-07n5
blocked_by:
    - accord-q8ns
---

---

assigned: implementer
---

Canon GC module in `apps/cranker`. Two triggers, one deduped dispatch (milestone accord-clfq HANDOFF §1 step 4 / §4 pseudo-code):

1. event-driven: subscribe CanonItem account notifications (pattern: `listener.ts` WS + memcmp) — items landing in `Removed` (post `ItemSettled`/`Withdrawn`) dispatch immediately;
2. reconciler 60s poll: `getProgramAccounts` on the canon program with discriminator + `state == Removed` memcmp → dispatch `close_item` for each (catches anything the listener missed, including pre-existing delisted items).
Shared: `cranks/close-item.ts` (build + send `closeItem` via `@useaccord/canon`), dedup via the existing dispatch/state store, profitability guard (skip when account lamports ≤ tx fee + margin). Prefer parameterizing `ProgramAccountListener` over a canon-specific copy if the diff is smaller — implementer's call, state the choice in the bean body.

## Acceptance criteria

- [ ] close-item crank + canon wiring in reconciler/listener/dispatch (canon program id configurable, module toggleable)
- [ ] GPA memcmp filter correct (CanonItem discriminator + ItemState::Removed offset)
- [ ] listener + reconcile converge on one dispatch per item (dedup, in-flight aware)
- [ ] unit tests with fixture `Removed` items: dispatch-once, skip-unprofitable, both trigger paths
- [ ] cranker lint + tests green; no regression in accord cranking
