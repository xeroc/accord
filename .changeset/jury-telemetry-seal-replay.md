---
"@useaccord/evidence-daemon": minor
---

Jury telemetry read side (ADR-0037): seal-on-read predicate + unseal flush scheduler (`src/pipeline/seal.ts` — one `sealVisible` gate every read path applies; per sealed frame a timer at `unsealAt` re-fans out), the replay endpoint `GET /trace/{dispute}?fromSeq=` (durable record, seal-filtered, any replica), and the live watch surface `WS /watch/{dispute}` (`src/server/watch.ts` — replay-then-live over store tail ∪ ring buffer, per-IP connection cap, ping keepalive; sealed verdicts flush at `unsealAt`). Push leg and trace store land with their beans (beans accord-0yxb, accord-f6hh, accord-heqb).
