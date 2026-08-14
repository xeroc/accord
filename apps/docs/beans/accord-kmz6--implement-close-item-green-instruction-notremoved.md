---
# accord-kmz6
title: Implement close_item (GREEN) — instruction, NotRemoved, ItemClosed, SPEC
status: todo
type: task
priority: normal
created_at: 2026-08-14T19:06:45Z
updated_at: 2026-08-14T19:07:16Z
parent: accord-98gr
blocked_by:
    - accord-m0a1
---

---

assigned: implementer
---

GREEN. Implement `close_item` per milestone accord-clfq HANDOFF §2/§4: `src/instructions/close_item.rs` (self-seeding `[SEED_CANON_ITEM, item.list, item.account]`, `bump = item.bump`, NO CanonList account; `close = caller`), `NotRemoved` error variant, `ItemClosed` event, wiring in `instructions/mod.rs` + `lib.rs`. Docs in the SAME change per AGENTS §Documentation: SPEC.md gains instruction-table row #8, a state-machine note that `Removed` is closeable and closing re-opens the seed for re-submission, and an edge-case line. Bootstrap `programs/canon/canon.qedspec` with the accumulated instruction set if the diff stays small; otherwise record the follow-up in the bean body (do not silently drop it).

## Acceptance criteria

- [ ] guards: `state == Removed`, `accumulated_stake == 0`, `active_dispute == Pubkey::default()`; then `emit!(ItemClosed …)`; close handled by Anchor `close = caller`
- [ ] `close_item_litesvm.rs` green via `make test_unit`
- [ ] `anchor build --ignore-keys` green, IDL emits `close_item`
- [ ] SPEC.md updated (instruction table + state machine + re-submission-is-intentional note)
- [ ] no re-init-same-tx footgun introduced (re-submission is a separate instruction/tx by construction)
