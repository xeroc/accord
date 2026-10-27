---
# accord-k37d
title: 'Store port: per-file put/get/list (fs + s3) + path-key hygiene'
status: completed
type: task
priority: normal
created_at: 2026-09-22T11:35:19Z
updated_at: 2026-09-22T12:18:23Z
parent: accord-np69
---

TDD: extend store port with putFile/getFile/listFiles keyed (subaccord, dispute, round, path); fs + s3 impls; traversal-safe key construction.

## Notes

Started 2026-09-22. Port shape: putFile/getFile/listFiles on EvidenceStore + isSafeEntryPath validator (format §3.2: relative POSIX, no leading /, no .. or empty segments, no backslash). Layout: manifest stays `{round}.json`; files under `{round}.files/{path}` (fs) / key prefix `{sa}/{d}/{round}.files/` (S3). Reuses serializeBundle + EvidenceConflictError.

## Summary of Changes

- store.ts: isSafeEntryPath (format §3.2), EvidenceStore.putFile/getFile/listFiles, EvidenceConflictError.path
- fs.ts: writeIdempotent extraction; files under {round}.files/{path}; recursive listFiles
- s3.ts: putObject extraction; key {sa}/{d}/{round}.files/{path}; ListObjectsV2 pagination loop
- 21 new tests (fs 12, s3 7 + shared semantics), 76 store tests green; daemon lint+build green
- Pre-existing (not this bean): 14 wire.test.ts failures from tests/helpers/accordStub.ts:208 u64 codec stub drift — clean-tree repro, out of scope
