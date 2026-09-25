---
# accord-f7dp
title: 'SDK: Delivery Key protocol + juror client'
status: todo
type: task
priority: normal
created_at: 2026-09-25T08:59:29Z
updated_at: 2026-09-25T09:00:45Z
parent: accord-5q2n
---

---

assigned: implementer
---

`packages/sdk/src/evidence/delivery-key.ts` (new) + fetch/ecies/keys/index updates: `generateDeliveryKey()`, `DELKEY_PREFIX`, `buildDeliveryKeyMessage`, `verifyDeliveryKeyRegistration` (daemon-shared), `registerDeliveryKey`, `fetchDelivery`, `jurorDecryptDelivery(delivered, deliverySecret)`, persistence codec + optional IndexedDB helper, stale-key self-heal loop. Delete Ed-seed `jurorDecrypt` + Ed→X `deliverToJuror`; migrate in-repo callers. Colocated `*.test.ts` per repo convention. See milestone accord-6im8 HANDOFF §2.
