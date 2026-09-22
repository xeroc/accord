---
# accord-85yu
title: 'POST manifest: decrypt-verify + entries parse + dispatch + limits'
status: completed
type: task
priority: normal
created_at: 2026-09-22T11:35:19Z
updated_at: 2026-09-22T12:44:09Z
parent: accord-np69
---

TDD: ingest decrypts via keyring, verifies sha256(plaintext)==plaintext_hash, parses entries; unknown schema WITH entries -> 400; >MAX_ENTRIES -> 400; path hygiene -> 400. v1 no-entries -> manifest-only, complete immediately.

## Summary of Changes

- ingest.ts: IngestKeyring/IngestCrypto/IngestLimits ports; decrypt-verify gate; multifile dispatch (unknown schema + entries = 400); entry validation (hygiene/dupes/hex/maxEntries); manifest-only back-compat preserved
- SDK parse.ts: schema extraction, unquoted scalars, total parser (+4 tests, 102 green)
- wire.ts/main.ts/config.ts: adapters + EVIDENCE_MAX_{ENTRIES,DOC_BYTES,PACKAGE_BYTES}
- tests/pipeline.test.ts migrated to v2 ports; accordStub.ts repaired vs ADR-0030 regen — daemon suite 303/303 green
