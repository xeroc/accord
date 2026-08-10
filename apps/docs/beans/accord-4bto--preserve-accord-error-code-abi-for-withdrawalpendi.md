---
# accord-4bto
title: Preserve Accord error-code ABI for WithdrawalPending
status: todo
type: bug
priority: high
created_at: 2026-08-10T02:17:26Z
updated_at: 2026-08-10T02:17:26Z
---

## Problem

`WithdrawalPending` was inserted in the middle of Anchor's sequential `#[error_code]` enum at `programs/accord/src/errors.rs:49`. This shifts every subsequent public numeric error code. Existing generated and published clients decode errors incorrectly; the committed SDK still maps `InsufficientJurors` to 6018 and `FeeMismatch` to 6021 and has no `WithdrawalPending` entry.

Relevant code:

- `programs/accord/src/errors.rs:41-55`
- `packages/sdk/src/generated/errors/accord.ts:39-60`

## Acceptance Criteria

- [ ] Preserve every pre-existing Accord error number.
- [ ] Place `WithdrawalPending` at an ABI-safe position or introduce explicit stable numbering.
- [ ] Regenerate the complete Anchor IDL and Codama SDK output.
- [ ] Rebuild package artifacts consumed by released applications.
- [ ] Add a test or generated-artifact check that detects unintended error-code renumbering.
- [ ] Document the stable error-code policy for future additions.
