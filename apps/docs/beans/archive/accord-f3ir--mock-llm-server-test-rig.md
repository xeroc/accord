---
# accord-f3ir
title: Mock LLM server & test rig
status: completed
type: task
created_at: 2026-10-15T07:32:42Z
updated_at: 2026-10-15T07:32:42Z
parent: accord-mehu
---

tests rig: openai-compatible stub HTTP server returning canned tool-calls + verdicts (also: malformed, refusal, timeout). AC: agent unit/integration tests fully deterministic against it.

## Summary of Changes

- `apps/jurat/src/agent/testing/mock-llm.ts` — `startMockLlm(turns)`: Bun.serve
  stub speaking the openai-compatible `/chat/completions` wire format (SSE
  streaming AND non-streaming JSON, honoring the request's `stream` flag).
  Scripted `MockTurn`s in fixed order: `text`, `toolCalls` (verdict shape),
  `malformed` (200 + garbage), `httpError`, `hang`. Captures every request
  (path, auth, parsed body) for agent-test assertions. Determinism: fixed
  `created` timestamp, sequential ids, no randomness — same script →
  byte-identical traffic. Exhausted script answers a loud JSON wire-error 500
  that the provider surfaces client-side.
- `apps/jurat/src/agent/testing/mock-llm.test.ts` — 9 tests proving the rig
  against the REAL `@ai-sdk/openai-compatible` + `ai` v7 client (the
  ADR-0036 stack): generateText/streamText happy paths, tool-call agent loop
  (v7 `.input` args), refusal shape (text instead of tool call), malformed,
  429, hang-vs-abortSignal, exhausted script, and cross-server determinism.
  Failure-path tests pass `maxRetries: 0` — the SDK's own retry backoff is
  the agent runner's ladder to build, not the rig's.
- Deps: `ai@^7`, `@ai-sdk/openai-compatible@^3`, `zod@^4` added to
  `@useaccord/jurat` (runtime deps per ADR-0036).
- `apps/jurat/SPEC.md` module map + verification section updated.

Verification: `pnpm run build` (tsc), `pnpm run lint` (eslint clean),
`pnpm test` — 17/17 pass (8 notify + 9 rig).
