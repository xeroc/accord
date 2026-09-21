---
# accord-evkk
title: Accord — create_subaccord (and update path) missing alpha_bps <= 10_000 guard
status: scrapped
type: bug
priority: normal
created_at: 2026-08-19T18:18:14Z
updated_at: 2026-08-31T18:02:30Z
---

Verified while designing canon per-list court params (milestone per-list-court-parameters): `programs/accord/src/instructions/create_subaccord.rs` handler (validation block) has NO `alpha_bps <= 10_000` require — a direct `create_subaccord` caller can set a slash factor above 100%. Canon now guards its own CPI path (`AlphaTooHigh`), but Accord Core should enforce the invariant for all callers. Also audit `propose_subaccord_update` / `UpdatePayload::AlphaBps` for the same gap (not audited yet).

## Reasons for Scrapping (2026-08-31 — already implemented)

Both gaps the bean names are closed in the tree:

- Creation: `require!(alpha_bps <= 10_000, AccordError::InvalidThreshold)` at `programs/accord/src/instructions/create_subaccord.rs:128` (part of the H-3 2026-08-19 security-review fix that mirrors `validate_update_payload` bounds at creation).
- Update path: `validate_update_payload` arm `UpdatePayload::AlphaBps(v) => require!(*v <= 10_000, ...)` (`programs/accord/src/utils.rs:15`), invoked at BOTH gates — `propose_subaccord_update.rs:50` and `execute_subaccord_update.rs:36` (defense-in-depth re-validation).

LiteSVM coverage exists (`update_litesvm.rs` bounds tests + the H-3 creation-mirror tests). Nothing left to do.
