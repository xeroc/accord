---
# accord-6kza
title: CLI — domain:put --subaccord required + skill docs
status: completed
type: task
priority: normal
created_at: 2026-08-19T20:35:24Z
updated_at: 2026-08-19T22:50:59Z
parent: accord-5p9j
blocked_by:
  - accord-uecf
---

apps/cli domain:put: refactor onto SDK putDomainDoc; `--subaccord <addr>` REQUIRED (anchor for the daemon gate); domain:get unchanged. Update .agents/skills/useaccord command examples + flag tables (grep the whole skill dir for domain:).

Verify: CLI put/get round-trip against local daemon with an on-chain anchor (devnet/localnet smoke).

## Summary of Changes

- `apps/cli/src/commands/domain/put.ts`: refactored onto SDK `putDomainDoc` (single publish implementation); `--subaccord <addr>` is REQUIRED (anchor for the daemon's chain gate); `DomainPublishError` mapped to human hints per status (404 anchor-missing, 400 ref-mismatch, 409 collision). Content-Type picked presentation-only (.md/.markdown → text/markdown, else octet-stream).
- `apps/cli/src/commands/domain/get.ts`: unchanged (already SDK `fetchDomainDoc`).
- `apps/cli/test/commands/domain/domain.test.ts`: stub daemon now enforces the anchor gate (?subaccord required, domain_ref == hash); new tests — missing `--subaccord` usage error, 404 unknown anchor, 400 anchor ref mismatch; version key no longer surfaces from get.
- `apps/cli/package.json`: `bun test --timeout 20000` — the CLI spawns subprocesses per test; cold starts exceeded bun's 5 s default (observed flake).
- `.agents/skills/useaccord/references/10-domains.md`: corrected the put semantics line — the CLI hashes locally and PUTs via SDK `putDomainDoc`; the daemon anchor-verifies server-side (the old wording implied the CLI pre-verifies against on-chain state). Examples + flag tables were already swept by accord-n6xt; re-grepped the skill dir — no other `domain:` drift.
- Smoke (local Surfnet + fs-backend daemon): created anchor Subaccord with `domain_ref = sha256(rules.md)` on 127.0.0.1:8899 (canonical program), ran `domain:put --subaccord <pda>` → 201 published, `domain:get <hash>` → identical bytes + text/markdown + frontmatter title/description, re-put → 200 idempotent no-op. Scratch smoke scripts removed.
- Verify: `pnpm test` (133 pass), `pnpm lint`, `pnpm build` green in apps/cli.
