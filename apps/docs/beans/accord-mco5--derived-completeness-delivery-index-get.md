---
# accord-mco5
title: Derived completeness + delivery index GET
status: completed
type: task
priority: normal
created_at: 2026-09-22T11:35:20Z
updated_at: 2026-09-22T13:07:27Z
parent: accord-85jo
---

TDD: index response {rounds:[{round, manifest, files:[{path,status}]}]}; derived on read; v1 shape-compat (empty files).

## Summary of Changes

- deliver(): per-round derived index — DeliveredRound.files [{path, status: stored|pending|out_of_band}] + complete flag; entries × store listing, no persisted state; PUT's leaf gate makes path presence imply content match
- v1 shape-compat: manifest-only rounds → files: [], complete: true; synod rounds same
- DeliverStore port + wire adapter grew listFiles (FileStat)
- 3 new derived-index tests; suite 324/324 green
