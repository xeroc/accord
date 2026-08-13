---
# accord-qt6w
title: Inline dispute-status card + deep link to accord app
status: todo
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T02:08:01Z
parent: accord-t877
---

Decode the backing accord Dispute PDA (CanonItem.active_dispute) via @useaccord/sdk decoders (raw-RPC read). Compact card: phase/round/final ruling. Deep link (VITE_ACCORD_APP_URL/disputes/:address, new tab). DoD: card shows live dispute phase; link opens accord app. see milestone §7.
