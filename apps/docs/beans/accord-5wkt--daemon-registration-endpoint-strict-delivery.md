---
# accord-5wkt
title: 'Daemon: registration endpoint + strict delivery'
status: todo
type: task
priority: normal
created_at: 2026-09-25T08:59:29Z
updated_at: 2026-09-25T09:00:45Z
parent: accord-5q2n
blocked_by:
    - accord-f7dp
---

---

assigned: implementer
---

`PUT`/`GET /jurors/{juror}/delivery-key` (sig-verify fail ⇒ 400, `registered_at <= stored` ⇒ 409), `DeliveryKeyStore` trait + S3/fs impls (`juror-keys/` namespace, retention-sweep-safe), and the strict switch: `deliver`/`deliverFile`/`deliverSynodGroup` resolve the registered key after the drawn gate — unregistered ⇒ 404, no Ed→X fallback. Pipeline tests per HANDOFF §6. Blocked by the SDK task (wire helpers come from it).
