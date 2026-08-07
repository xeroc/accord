---
# accord-siul
title: Export typed fetchers that work with raw Kit RPC
status: todo
type: task
created_at: 2026-08-07T23:08:48Z
updated_at: 2026-08-07T23:08:48Z
parent: accord-mpjd
---

The generated accounts modules already export fetchSubaccord(rpc, address) etc. that work with a raw Kit RPC. The SDK's fetch.ts wrappers route through accord.client which has the ClientWithRpc type issue. Fix: either export the generated fetch functions directly from index.ts, or rewrite fetch.ts wrappers to accept an RPC parameter. Frontend must get typed Account<T> back, never raw bytes.
