---
# accord-83sq
title: 'canon — SubmitItemPage: drop evidence field, send zero hash'
status: completed
type: task
priority: normal
created_at: 2026-08-20T16:44:40Z
updated_at: 2026-08-20T16:44:48Z
---

Remove the evidence-hash input from the submit form; submit an all-zero 32-byte hash to satisfy the on-chain submit_item arg until evidence authoring is wired. Program unchanged.

## Summary of Changes

- `apps/canon/src/features/item/SubmitItemPage.tsx`: evidence-hash field, `evidenceHex` state, `parseHash32`, `ZERO_HASH`, and `FieldError` import removed; `submitItem` now receives `evidence: ZERO_EVIDENCE` (all-zero 32 bytes). Header doc-comment updated. On-chain `submit_item` unchanged (still takes `[u8; 32]`; the event carries zeros).
- Verify: `@useaccord/canon-app` lint (tsc) + build green; grep confirms no leftover evidence-field references.

## Addendum (button-disabled report)

- Report: "Submit button never enables after evidence-field removal." Verified live against the running dev server (devnet, headless browser): with the list loaded and a 44-char account filled, the only false term in `ready = !!env && !!listData && account.length > 30` is `env` — i.e. no connected wallet. The pre-change `ready` also required `!!env`, so the removal strictly loosened the gate; the removed evidence term was not what enabled the button.
- Change: submit button now self-labels "Connect a wallet to submit." when `env` is null, so a disabled button always shows its reason.
- Verify: tsc green; live page check shows the labeled disabled state with account filled.
