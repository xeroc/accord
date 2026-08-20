---
# accord-evkk
title: Accord — create_subaccord (and update path) missing alpha_bps <= 10_000 guard
status: draft
type: bug
priority: normal
created_at: 2026-08-19T18:18:14Z
updated_at: 2026-08-19T18:18:14Z
---

Verified while designing canon per-list court params (milestone per-list-court-parameters): `programs/accord/src/instructions/create_subaccord.rs` handler (validation block) has NO `alpha_bps <= 10_000` require — a direct `create_subaccord` caller can set a slash factor above 100%. Canon now guards its own CPI path (`AlphaTooHigh`), but Accord Core should enforce the invariant for all callers. Also audit `propose_subaccord_update` / `UpdatePayload::AlphaBps` for the same gap (not audited yet).
