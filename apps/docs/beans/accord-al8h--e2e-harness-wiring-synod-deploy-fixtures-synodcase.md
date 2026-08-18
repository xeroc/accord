---
# accord-al8h
title: e2e harness wiring — synod deploy + fixtures (SynodCase)
status: todo
type: task
created_at: 2026-08-18T05:28:56Z
updated_at: 2026-08-18T05:28:56Z
parent: accord-ndl9
---

assigned: implementer
tests/src: extend setup/env.ts with the synod facade + programId (probe deploy, clear make run_surfpool hint); setup/fixtures.ts gains synod case fixtures (parties arrays, stake/fee math, evidence hash vectors) and the mint setup reuses setup/tokens.ts (fee_token mint + party ATAs). No copy-paste of RPC/payer boilerplate. Anchor.toml test path already deploys via Surfnet runbook — verify .so deploy of synod lands.
