---
# accord-eiag
title: 'canon — ItemDetailPage: list-context + item-hero restructure'
status: completed
type: task
priority: normal
created_at: 2026-08-20T17:22:20Z
updated_at: 2026-08-20T17:22:31Z
---

Make the curated account the page's hero and give the rules doc context: page reads The list (what this list is about — criteria doc, framed) → The item (the curated account, full address, state, challenge action) → facts/per-state sections. Also wire recovery upload (subaccord) into this panel use.

## Summary of Changes

- `apps/canon/src/features/item/ItemDetailPage.tsx` restructured top-down: back-link targets the parent list; "The list." section frames the DomainDocPanel as the list's listing criteria (challenges cite them, jurors rule by them) and passes `subaccord` (recovery upload from accord-k6y2 available here too); "The item." hero card shows the curated account at full length (Copyable, head=length), state + transition hint + the Challenge action; old header (Canon item + PDA + challenge btn) and Account/List dl rows removed — Item PDA row added to facts with Copyable.
- Verify: tsc + vite build green; live devnet check (list 2TtX… / item DBF4…TwWY, Disputed): DOM order confirms list framing, missing-doc card with "Upload rules document", hero with full account; Challenge button correctly absent in Disputed. Screenshot captured; no vision model configured — layout reuses existing app card/heading patterns.
