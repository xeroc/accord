---
"@useaccord/jurat": minor
---

Duty-lifecycle trace emitters + runtime wiring (ADR-0037): the runtime binds a memoized per-duty TraceSink and emits duty-open at tracking, evidence (path + sha256 + bytes manifest) after intake, the sealed verdict (unsealAt = round.revealEnd in ms), commit/reveal tx events, and abstain; the agent step tap rides AgentContext.trace through the same sink; main.ts wires the RemoteTraceSink binder from JURAT_TRACE_* config (bean accord-w4j7).
