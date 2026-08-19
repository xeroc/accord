---
# accord-c2i0
title: CLI domain:put / domain:get + useaccord skill update
status: completed
type: task
tags:
  - implementer
created_at: 2026-08-18T23:00:04Z
updated_at: 2026-08-19T00:00:00Z
parent: accord-x49o
blocked_by:
  - accord-lohs
  - accord-49b3
---

apps/cli/src/commands/domain/: domain:put <file> (sha256 → PUT → print hash), domain:get <hash> (fetch → re-hash → print). --daemon-url flag + ACCORD_DAEMON_URL env fallback. Update .agents/skills/useaccord/ examples + flag tables in the same change (AGENTS change-coupling). Uses SDK domain.ts only — no hand-rolled hashing.

## Summary of Changes

- `apps/cli/src/commands/domain/put.ts` — `domain:put <file>`: reads raw bytes, hashes via SDK `hashDomainDoc` (no hand-rolled hashing), PUTs to `{--daemon-url}/domains/{hash}`; 201 created / 200 already-published (idempotent no-op) rendered through the standard read emitters (`--json`/`--quiet`); daemon errors surfaced with exit 1 (409 gets the never-overwrite collision hint). Content-Type: `text/markdown` for `.md`/`.markdown`, else `application/octet-stream`.
- `apps/cli/src/commands/domain/get.ts` — `domain:get <hash>`: SDK `fetchDomainDoc` (fetch + sha256 re-verify + frontmatter parse); human mode prints metadata then body verbatim, `--quiet` prints body only; arg lowercased before the daemon's strict-hex route.
- `--daemon-url` flag on both with `ACCORD_DAEMON_URL` env fallback (`required: true, env:` — oclif resolves env when the flag is absent).
- `apps/cli/package.json` — registered the `domain` oclif topic.
- `apps/cli/test/commands/domain/domain.test.ts` — 11 tests against an in-process `Bun.serve` CAS mirroring the daemon contract: help smoke (flags + env documented), 201 publish, 200 no-op, `--quiet`/`--json` modes, env fallback, 409 collision error, get verify + frontmatter + body, 404 error. All green; full CLI suite 130 pass, `lint` (eslint) and `build` (tsc --noEmit + tsup) clean.
- `.agents/skills/useaccord/` — SKILL.md routing row + `when_to_use`/env-var mentions, new `references/10-domains.md` with commands, flag table, status-code semantics, and SDK fn mapping.
