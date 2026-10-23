---
# accord-1nxb
title: Agent step tap — onStepFinish + AgentContext.trace
status: completed
type: task
created_at: 2026-10-23T09:32:58Z
updated_at: 2026-10-23T11:05:00Z
parent: accord-c19g
---

runner.ts: optional `trace` callback on AgentContext → pass to `generateText({ onStepFinish })`; map each step to a `step` event {n, toolCalls [{name, args (builtin four only), argsDigest (MCP), resultDigest, bytes, ms}], usage}; emit `agent-start` {model, maxSteps} before the call. NEVER include tool result content or intermediate model text (ADR-0037). RED→GREEN using the mock-llm rig (src/agent/testing/): N steps → N events in order, digests stable, container seam unaffected.

## Summary of Changes

- `apps/jurat/src/agent/runner.ts`: optional `trace?: (event: RunnerTraceEvent) => void` on `AgentContext`. `runVerdict` emits `agent-start {model, maxSteps}` before the call and wires `generateText({ onStepFinish })` → one `step` event per model step via `stepEvent()`: `{n (1-based), toolCalls [{name, args (builtin four only) | argsDigest (MCP), resultDigest, bytes, ms (SDK`performance.toolExecutionMs`)}], usage}`. Tool results and model text are NEVER included — digests only (ADR-0037).
- Exported `canonicalJson` (recursively sorted keys, no whitespace) + `digestOf` (sha256 hex) — the digest + future batch-signature form; exported for the trace sink (accord-9pdg) to reuse, not duplicate.
- `apps/jurat/src/agent/tools.ts`: exported `BUILTIN_TOOL_NAMES` (the closed builtin-four record the redaction gate keys off).
- `apps/jurat/src/agent/runner.test.ts`: 4 new tests on the mock-llm rig — agent-start + N ordered step events (hardcoded canonical-JSON digest oracles), MCP args digest-only + no-args-key, digest stability across runs, BUILTIN_TOOL_NAMES ≡ makeJuratTools keys. No-trace path covered by the pre-existing runner tests (verdict unchanged, container seam `VerdictRunner` untouched).
- `apps/jurat/SPEC.md`: Agent runner section documents the trace tap. Changeset added.
- Verification: RED (missing exports → suite fail) → GREEN: `bun test` 180 pass / 0 fail, `tsc --noEmit` clean, `eslint` clean in @useaccord/jurat.
