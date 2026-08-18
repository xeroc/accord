---
# accord-nsxa
title: '@useaccord/synod facade — pda.ts, methods, fetchers, index'
status: todo
type: task
created_at: 2026-08-18T05:28:56Z
updated_at: 2026-08-18T05:28:56Z
parent: accord-e4up
blocked_by:
    - accord-8y6m
---

assigned: implementer
Hand-written surface over the generated client, mirroring the canon facade layout: pda.ts (synodCasePda [+ vault ATA helper via Kit getProgramDerivedAddress — NOT @solana/spl-token, jest breaks on uuid ESM]), methods (openCase, join, fileDispute, refundRosterMiss, claim), typed fetchers that work with raw Kit RPC (canon/accord precedent — setup/assertions depends on this), index exports. Unit tests per package test script. accountsStrict() style. See milestone accord-oylq HANDOFF §2/§3.
