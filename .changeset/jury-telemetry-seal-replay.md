---
"@useaccord/evidence-daemon": minor
---

Jury telemetry read side (ADR-0037): seal-on-read predicate + unseal flush scheduler (`src/pipeline/seal.ts` — one `sealVisible` gate every read path applies; per sealed frame a timer at `unsealAt` re-fans out) and the replay endpoint `GET /trace/{dispute}?fromSeq=` (durable record, seal-filtered, any replica). Push leg, trace store, and `WS /watch` land with their beans (beans accord-0yxb, accord-f6hh).
