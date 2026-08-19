---
# accord-5p9j
title: Creation flows — domain-doc authoring + chain-anchored publish (write path)
status: todo
type: epic
priority: high
created_at: 2026-08-19T20:35:24Z
updated_at: 2026-08-19T20:36:13Z
parent: accord-lgof
---

## Scope

Write path: author domain docs in the dApp create flows, publish AFTER creation so the daemon can verify the hash against on-chain state. Extension of accord-lgof — see milestone "Rewritten scope (2026-08-19)".

## Design decisions (grilled 2026-08-19)

- CREATE-FIRST: client hashes the doc → tx with `domain_ref`/`rules_hash` = hash → after the create-tx CONFIRMS → `PUT /domains/{hash}`. Reverses lgof's doc-first flow and "dumb CAS / no chain reads" decision (ADR-0027 amendment task covers the reversal).
- PUT contract: `PUT /domains/{hash}?subaccord=<addr>`; daemon `fetchSubaccordMaybe(anchor)` polled up to 1000 ms (commitment lag), then requires `domain_ref == hash`. Subaccord is the universal anchor — canon's create_list CPIs a backing Subaccord with `domain_ref := rules_hash`, so both apps and any Arbitrable anchor via Subaccord; no memcmp scans, no CanonList-specific path. GET stays ungated.
- SDK gains the single `putDomainDoc(daemonUrl, bytes, { subaccord })` implementation; CLI `domain:put` refactors onto it and grows a REQUIRED `--subaccord <addr>`.
- Create forms: template-prefilled editor is the default; "reference existing hash" advanced mode with live GET+verify preview before signing; apps/app's randomHex32 domain-ref generator is DELETED (a random ref can never have a doc — no preimage).
- Publish failure ≠ creation failure: card stays in missing state with retry (paste or file; client verifies sha256 == on-chain ref before PUT; daemon re-verifies).

## Acceptance

- [ ] SDK putDomainDoc + unit tests (URL shape, ?subaccord param, non-2xx → typed error)
- [ ] Daemon: anchor gate (≤1000 ms poll via injected fetcher seam; tests: anchor-appears-late → accepted, never-appears → 404, mismatch → 400); GET unchanged; SPEC updated
- [ ] CLI domain:put --subaccord required + .agents/skills/useaccord examples updated
- [ ] apps/app + apps/canon create flows: editor + paste-hash + post-confirm publish + retry; pure-logic node:test for the form/hash/publish state machine
- [ ] ADR-0027 amendment + docs sweep (daemon SPEC, canon SPEC, adr index)
- [ ] lint/build/test green across touched packages
