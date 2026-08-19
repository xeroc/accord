---
# accord-kmz6
title: Implement close_item (GREEN) — instruction, NotRemoved, ItemClosed, SPEC
status: completed
type: task
priority: normal
created_at: 2026-08-14T19:06:45Z
updated_at: 2026-08-19T20:55:00Z
parent: accord-98gr
blocked_by:
    - accord-m0a1
---

---

assigned: implementer

---

GREEN. Implement `close_item` per milestone accord-clfq HANDOFF §2/§4: `src/instructions/close_item.rs` (self-seeding `[SEED_CANON_ITEM, item.list, item.account]`, `bump = item.bump`, NO CanonList account; `close = caller`), `NotRemoved` error variant, `ItemClosed` event, wiring in `instructions/mod.rs` + `lib.rs`. Docs in the SAME change per AGENTS §Documentation: SPEC.md gains instruction-table row #8, a state-machine note that `Removed` is closeable and closing re-opens the seed for re-submission, and an edge-case line. Bootstrap `programs/canon/canon.qedspec` with the accumulated instruction set if the diff stays small; otherwise record the follow-up in the bean body (do not silently drop it).

## Acceptance criteria

- [x] guards: `state == Removed`, `accumulated_stake == 0`, `active_dispute == Pubkey::default()`; then `emit!(ItemClosed …)`; close handled by Anchor `close = caller`
- [x] `close_item_litesvm.rs` green via `make test_unit`
- [x] `anchor build --ignore-keys` green, IDL emits `close_item`
- [x] SPEC.md updated (instruction table + state machine + re-submission-is-intentional note)
- [x] no re-init-same-tx footgun introduced (re-submission is a separate instruction/tx by construction)

## Summary of Changes

Implemented `close_item` (GREEN) exactly per the accord-m0a1 RED suite: `programs/canon/src/instructions/close_item.rs` (self-seeded item PDA, `close = caller`, guards in HANDOFF §4 order — state first, then the two defensive invariants), `NotRemoved` + `StakeOutstanding` error variants, `ItemClosed` event (emitted pre-drain), `instructions/mod.rs` + `lib.rs` dispatch wiring, SPEC.md row #8 + `REMOVED`-is-closeable/seed-re-open state-machine note + rent-bounty edge-case line. IDL verified to emit `close_item` with the self-seeding PDA shape; `anchor build --ignore-keys` green.

**Latent suite rot fixed (uncovered by this change):** `make test_unit` only passed `accord/no-entrypoint`, so every canon + synod `*_litesvm.rs` target silently compiled with 0 tests — the exact failure mode the Makefile's own comment warns about. Under the skipped state, canon/synod fixtures had rotted when `4a1f3ee` (64-byte tail `padding` on `Subaccord`/`AccordState`/`Dispute`) and `bbc46fb` (`drawn_seats` on `Dispute`) landed. Fixed the Makefile (all three `no-entrypoint` features) and the six stale fixture initializers (canon `settle_item_litesvm.rs`; synod `join`/`open_case`/`file_dispute`/`payout`). Whole workspace now actually runs: every suite green, incl. close_item 7/7.

**Follow-up recorded (not silently dropped):** canon `.qedspec` bootstrap is too large to ride along — draft bean accord-2gpf.

SDK codegen + `closeItem` facade intentionally NOT done here (sibling bean accord-q8ns); e2e (accord-q3l5) and cranker GC (accord-m5fd) likewise.
