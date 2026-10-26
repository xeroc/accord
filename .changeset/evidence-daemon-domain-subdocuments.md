---
"@useaccord/evidence-daemon": minor
---

Domain CAS sub-documents: `PUT /domains/{ref}/{doc}?subaccord=<addr>` + `GET /domains/{ref}/{doc}`. Per-item public docs namespaced under an anchor Subaccord's `domain_ref` (e.g. an Arbitrable's per-thesis docs under its shared court — identity/proof mode pin one doc per domain_ref and cannot host per-item docs). Content-addressed (`sha256(body) == doc`, no proof mode), chain-anchored (`domain_ref == ref`, same create-first poll), dual-written to the bare `domains/{sha256(body)}` key so bare-hash fetch keeps working. Open namespace by design — abuse bounds: per-IP rate limit, per-doc cap, forever retention.
