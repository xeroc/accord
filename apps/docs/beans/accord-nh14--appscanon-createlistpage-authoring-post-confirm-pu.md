---
# accord-nh14
title: apps/canon — CreateListPage authoring + post-confirm publish
status: completed
type: task
priority: normal
created_at: 2026-08-19T20:35:24Z
updated_at: 2026-08-20T00:30:00Z
parent: accord-5p9j
blocked_by:
  - accord-uecf
  - accord-lbst
  - accord-yizt
---

Same flow as apps/app for rules_hash: editable DomainDocCard default (template prefill), paste-hash advanced with preview (replaces the bare manual-hex field), hash client-side, create_list after confirm → putDomainDoc against the backing Subaccord (derive via SDK findSubaccordPda/queries — domain_ref := rules_hash). Retry identical.

TDD: pure-logic tests for form/publish state machine first. Verify: tsc + node:test green.

## Summary of Changes

- `apps/canon/src/features/list/createForm.ts` (NEW): pure form logic extracted from CreateListPage — `FormState` gains `domainMode: "author" | "reference"` + `rulesDoc` (raw doc text); `DEFAULTS` = author mode pre-filled with the ui package's `DOMAIN_DOC_TEMPLATE` (replaces the empty manual-hex `rulesHash` default). Helpers `docBytes(form)` + `rulesHashHex(form)` (author: `hashDomainDoc(docBytes)` live; reference: pasted hex, validated in `buildArgs`, which now derives `rules_hash` from it and returns the parsed create-list args). Canonical defaults + parse helpers moved here from the page for node-testability. `PublishState`/`nextPublish` state machine: idle → tx-confirmed → pending → published | failed(error); failed → retry → pending; invalid transitions no-ops.
- `apps/canon/src/features/list/createForm.test.ts` (NEW, TDD — written first): 11 cases — template/deterministic defaults, doc→hash→args (buildArgs rules_hash bytes ≡ sha256(doc), empty listProgram → system program), reference-mode paste + bad-hex throw, UTF-8 docBytes, publish machine happy/retry/invalid paths.
- `apps/canon/src/features/list/CreateListPage.tsx`: new "Rules document." section replaces the bare Rules-hash field — default editable `DomainDocCard` (template prefill, live sha256, locks on submit); advanced reference mode = paste-existing-hash + live GET+verify preview via `useDomainDoc` → `DomainDocCard` read states. Submit: `createList` (SDK returns the backing Subaccord PDA — `domain_ref := rules_hash` — no separate derivation needed) → `sendInstruction` confirm → author mode `putDomainDoc(EVIDENCE_DAEMON_URL, docBytes, { subaccord })` (daemon anchor-verifies) → navigate to `/lists/:address`. Publish failure ≠ creation failure: toast + missing-state card with "Retry publish" (client `verifyDomainDoc(docBytes, frozen on-chain rules hash)` before PUT) and "Upload original file" (bytes accepted only when sha256 matches the frozen hash). Button reflects Signing…/Publishing… states.
- Verify: `@useaccord/canon-app` lint (tsc) + build green; node:test 64/64 (11 new). The daemon publish contract itself was proven live against a local daemon + Surfnet in accord-afcn (same SDK `putDomainDoc` + Subaccord anchor shape).
