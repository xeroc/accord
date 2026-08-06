---
# accord-gpfo
title: 'Runtime DisputeState export became type-only (REVIEW #12)'
status: completed
type: bug
priority: high
created_at: 2026-08-06T21:33:31Z
updated_at: 2026-08-06T21:33:31Z
parent: accord-yjno
---

REVIEW #12. packages/sdk/src/types.ts re-exported DisputeState as `type DisputeState`, erasing the runtime enum — so `dispute.state === DisputeState.Failed` broke through the public package. Generated DisputeState is a real enum; the siblings (UpdatePayload/LeafClaim/MSTNode) are pure types and were correctly type-only.

## Summary of Changes

- Dropped `type` from the DisputeState re-export in packages/sdk/src/types.ts (value export, matching the generated runtime enum).
- Added explicit `.js` extensions to all four re-exports in types.ts (it was the lone file using extensionless imports; the rest of the package — index.ts, methods/* — uses .js). This also makes the public types surface Node-ESM-importable, which is what let the bug slip through.
- Regression test in packages/sdk/src/methods/lifecycle.test.ts importing via dist/types.js (the actual re-export path): asserts DisputeState.Created=0, Drawn=1, Failed=8. Verified the test fails if `type` is re-added.

43 SDK tests pass; workspace lint clean.
