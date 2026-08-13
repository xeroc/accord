---
# accord-3sw6
title: Build useCanon hook + shared RPC/fetch/format utilities
status: todo
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T02:08:01Z
parent: accord-9mut
---

Shared: rpc.ts (raw Kit RPC), fetch.ts (raw-RPC decode via @useaccord/canon decoders — mirror apps/app fetchSubaccord pattern), format.ts (shortenAddress, time windows, bps), getProgramAccounts scan helper + CanonItem memcmp-on-list helper. DoD: can fetch+decode a CanonList + CanonItem by address. see milestone §2,§4.
