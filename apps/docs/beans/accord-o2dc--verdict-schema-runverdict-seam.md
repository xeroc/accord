---
# accord-o2dc
title: Verdict schema & runVerdict seam
status: todo
type: task
created_at: 2026-10-15T07:32:42Z
updated_at: 2026-10-15T07:32:42Z
parent: accord-sglt
---

src/agent/runner.ts: runVerdict(AgentContext)→Verdict {optionIndex, rationale, confidence} structured output, generateText tools+stopWhen stepCountIs; interface so a container backend can replace it. AC: unit tests vs mock openai-compatible server incl. malformed/invalid verdict rejection.
