---
# accord-3f19
title: Add typed getProgramAccounts query wrappers
status: todo
type: task
created_at: 2026-08-07T23:08:48Z
updated_at: 2026-08-07T23:08:48Z
parent: accord-mpjd
---

Add SDK functions that encapsulate discriminator + memcmp offset construction: findAllSubaccords(rpc), findJurorStakesBySubaccord(rpc, subaccord), findDisputesBySubaccord(rpc, subaccord), findJurorStakesByJuror(rpc, juror), findDisputesByFiler(rpc, filer). Each returns typed Account<T>[]. No raw bytes leak to the caller.
