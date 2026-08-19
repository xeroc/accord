---
# accord-zcjj
title: UI — DomainDocCard + consistent presentation (read path)
status: todo
type: epic
created_at: 2026-08-19T20:35:23Z
updated_at: 2026-08-19T20:35:23Z
parent: accord-lgof
---

## Scope

Read path for domain docs (ADR-0027 CAS): one `DomainDocCard` presented consistently across apps/app + apps/canon, plus the markdown-renderer dedupe it rides on. Extension of accord-lgof — see milestone "Rewritten scope (2026-08-19)".

## Design decisions (grilled 2026-08-19)

- One card, two modes: read-only (detail surfaces) + `editable` (create flow / retry dialog ONLY) — editing post-publish is impossible (`domain_ref` seeds the PDA; a changed hash anchors nothing), so the textarea locks on submit.
- Editable mode = ONE textarea over the raw doc text; YAML frontmatter visually emphasized as a distinct block (mono/background). No structured per-field forms.
- Frontmatter keys: `title` + `description` only — `version` is dropped from the SDK parser everywhere (the hash IS the version).
- Markdown rendering consolidates in `packages/ui` (`MarkdownText`; new deps react-markdown + remark-gfm); both apps' duplicated `MarkdownDescription` copies migrate onto it — one renderer repo-wide.
- Surfaces (6): apps/app `SubaccordDetailPage`, `Voting`; apps/canon `ListDetailPage`, `ItemDetailPage`, `ChallengePage`, `SubmitItemPage`. Browse/list views: nothing.
- Download action on the card: raw text file, same pattern as evidence docs.
- Missing-doc (404) state is loud and carries the retry/publish action (wired in the write-path epic).

## Acceptance

- [ ] `MarkdownText` in packages/ui; both apps' `MarkdownDescription` copies deleted, call sites migrated; lint/build green
- [ ] `DomainDocCard`: loading / missing / tampered / ok states + editable mode (locked on submit) + download; vitest + stories green
- [ ] SDK `parseDomainDoc` returns title/description only (`version` removed) + tests updated
- [ ] `useDomainDoc` hook per app over SDK `fetchDomainDoc`; six surfaces wired
- [ ] tsc/test/build green across packages/ui, packages/sdk, apps/app, apps/canon
