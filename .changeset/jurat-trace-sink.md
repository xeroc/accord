---
"@useaccord/jurat": minor
---

TraceSink + RemoteTraceSink (ADR-0037): sync never-throw emit with a bounded drop-oldest queue (256), signed Ed25519 batches (`{v, seq, events, sig}` over canonical JSON, 64-event chunks, 2s push timeout, drop-on-failure), no-op sink when JURAT_TRACE_URL is unset; JURAT_TRACE_MODE=sealed|open strips verdict unsealAt in open mode (bean accord-9pdg).
