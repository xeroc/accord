---
# accord-1nxb
title: Agent step tap — onStepFinish + AgentContext.trace
status: todo
type: task
created_at: 2026-10-23T09:32:58Z
updated_at: 2026-10-23T09:32:58Z
parent: accord-c19g
---

runner.ts: optional `trace` callback on AgentContext → pass to `generateText({ onStepFinish })`; map each step to a `step` event {n, toolCalls [{name, args (builtin four only), argsDigest (MCP), resultDigest, bytes, ms}], usage}; emit `agent-start` {model, maxSteps} before the call. NEVER include tool result content or intermediate model text (ADR-0037). RED→GREEN using the mock-llm rig (src/agent/testing/): N steps → N events in order, digests stable, container seam unaffected.
