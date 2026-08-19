---
# accord-6kza
title: CLI — domain:put --subaccord required + skill docs
status: todo
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
