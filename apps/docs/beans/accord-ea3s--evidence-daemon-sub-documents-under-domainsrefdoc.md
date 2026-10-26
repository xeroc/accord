---
# accord-ea3s
title: 'Evidence daemon: sub-documents under /domains/{ref}/{doc}'
status: completed
type: feature
priority: normal
created_at: 2026-10-26T09:58:02Z
updated_at: 2026-10-26T10:25:32Z
---

## Context

Inveigo (Arbitrable) needs per-thesis public docs under a shared per-mint court Subaccord. Identity/proof mode pin exactly one doc per domain_ref, so per-item docs cannot anchor at the court directly. Founder decision (2026-10-26): extend the domain CAS with sub-documents namespaced by the anchor's domain_ref.

## Contract

- PUT /domains/{domainRef}/{docHash}?subaccord=<addr> — sha256(body)==docHash (identity); anchor gate: subaccord exists + domain_ref==domainRef (create-first, same poll). Dual-write: domains/{ref}/{doc} + domains/{doc} (bare-hash fetch keeps working, cross-anchor dedup). No proof mode (sub-hash is content-addressed).
- GET /domains/{domainRef}/{docHash} — ungated, ETag docHash.
- Store key widened to 64hex or 64hex/64hex; fs mkdir already recursive; S3 key passthrough.
- Open-namespace tradeoff documented in SPEC (any anchor holder gets a namespace; per-IP rate limit + per-doc cap + forever retention remain).

## Work

- [x] RED: server/domain.test.ts gate matrix + domain-fs/domain-s3 nested-key tests
- [x] GREEN: pipeline/domain.ts putSubdocument, server/domain.ts routes, handlers.ts, wire.ts, store/domain.ts key widening
- [x] SPEC.md rows + namespace note + stale status line fix
- [x] changeset; bun test + eslint green

## Summary of Changes

- Store key widened to the namespaced {ref}/{doc} shape (both halves 64-hex, traversal-safe); fs + S3 backends pass nested-key round-trip/conflict/malformed tests unchanged.
- putSubdocument (pipeline/domain.ts): shape, cap, identity, idempotency, anchor gate (create-first poll, domain_ref == ref), dual write domains/{ref}/{doc} + bare domains/{doc} alias with interrupted-alias heal.
- Routes PUT/GET /domains/:ref/:doc (server/domain.ts) + DomainSubPutHandler wired via handlers.ts/wire.ts; proof params rejected loudly.
- SPEC.md: sub-document storage note, API rows, status line corrected to built.
- Verified: bun test 364 pass; tsc --noEmit + eslint clean.
