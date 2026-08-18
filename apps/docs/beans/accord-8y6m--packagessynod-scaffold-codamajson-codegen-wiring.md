---
# accord-8y6m
title: packages/synod scaffold + codama.json + codegen wiring
status: todo
type: task
created_at: 2026-08-18T05:28:56Z
updated_at: 2026-08-18T05:28:56Z
parent: accord-e4up
---

assigned: implementer
Mirror packages/canon package shape exactly (name @useaccord/synod, tsconfig, scripts incl. lint/build/test for the CI workflow). codama.json from the synod IDL emitted by anchor build. Extend the Makefile codegen target the way canon is wired. Verify: make codegen regenerates src/generated from the IDL; generated code never hand-edited. See milestone accord-oylq HANDOFF §2.
