---
# accord-afcn
title: apps/app — SubaccordCreatePage authoring + post-confirm publish
status: completed
type: task
priority: normal
created_at: 2026-08-19T20:35:24Z
updated_at: 2026-08-20T00:00:00Z
parent: accord-5p9j
blocked_by:
  - accord-uecf
  - accord-lbst
  - accord-yizt
---

Create form: default = editable DomainDocCard (template prefill) → hash computed client-side (hashDomainDoc) as domain_ref; advanced = paste-existing-hash with live GET+verify preview; DELETE randomHex32 default. On tx CONFIRM → putDomainDoc(daemonUrl, bytes, { subaccord }). Failure → toast + card remains in missing state with retry (paste/file, client sha256 == on-chain ref check). Pure form/publish logic in createForm.ts-style module with node:test coverage (doc→hash→args; publish state machine: pending/published/failed→retry).

TDD: state-machine tests first. Verify: tsc + node:test green; manual flow against local daemon.

## Summary of Changes

- `apps/app/src/features/subaccord/createForm.ts`: domain-identity rework (ADR-0027 amendment). `FormState` gains `domainMode: "author" | "reference"` + `domainDoc` (raw doc text); `randomHex32` DELETED (a random ref can never have a doc). `defaultFormState` = author mode pre-filled with the ui package's `DOMAIN_DOC_TEMPLATE` (deterministic). New pure helpers `docBytes(form)` (UTF-8) and `domainRefHex(form)` (author: `hashDomainDoc(docBytes)` live; reference: pasted hex, validated in `buildArgs`, which now derives `domain_ref` from it). New `PublishState`/`nextPublish` state machine: idle → tx-confirmed → pending → published | failed(error); failed → retry → pending; invalid transitions are no-ops.
- `apps/app/src/features/subaccord/createForm.test.ts` (TDD, written first — RED): 13 cases covering template/deterministic defaults, doc→hash→args (buildArgs domain_ref bytes ≡ sha256(doc)), reference-mode paste + bad-hex throw, and the publish machine's happy/retry/invalid-transition paths.
- `apps/app/src/features/subaccord/SubaccordCreatePage.tsx`: new "Domain document." section — default editable `DomainDocCard` (template prefill, live sha256 under the card, locks on submit); advanced reference mode = paste-existing-hash input + live GET+verify preview via `useDomainDoc` → `DomainDocCard` read states; the old random Domain Ref field + Reshuffle button removed from Advanced → Identity (evidence spec only). Submit: create-tx CONFIRM (`sendInstruction`) → author mode calls SDK `putDomainDoc(EVIDENCE_DAEMON_URL, docBytes, { subaccord })` (daemon anchor-verifies) → navigate on success. Publish failure ≠ creation failure: toast + card flips to missing state with retry — "Retry publish" re-checks `verifyDomainDoc(docBytes, frozen on-chain ref)` client-side before the PUT, "Upload original file" loads bytes only when sha256 matches the frozen ref (paste path = editable textarea in failed state, same client check on retry). Submit button reflects Signing…/Publishing… states.
- Manual flow verified against a live Surfnet + local fs-backend daemon: created a mint (surfnet cheatcode) + subaccord via `useaccord lifecycle:create-subaccord --domain-id <sha256(doc)>`, then the daemon publish contract end-to-end — GET 404 before, PUT 201 (anchor gate passed), GET 200 + `text/markdown` + `ETag` + `Cache-Control: immutable` with sha256 matching, idempotent re-PUT 200 no-op, tampered bytes 400.
- Verify: `@useaccord/app` lint (tsc) + build green; node:test 37/37.
