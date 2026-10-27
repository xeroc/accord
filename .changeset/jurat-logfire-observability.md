---
"@useaccord/jurat": minor
---

Jurat: LLM observability via Pydantic Logfire.

- `JURAT_LOGFIRE=1` exports every AI SDK 7 call (prompts, ⚒ tool calls, responses, token usage) plus winston log records as OpenTelemetry spans to Logfire (`xeroc/inveigo`, eu region) — `src/telemetry.ts` installs the global OTel provider via `@pydantic/logfire-node` and registers `@ai-sdk/otel`'s `OpenTelemetry` integration alongside the existing `JURAT_DEVTOOLS` capture (both can run together).
- `JURAT_LOGFIRE_SERVICE` (default `jurat`) sets the `service.name`; auto http/fs instrumentations are disabled so the chain-polling loop doesn't bury LLM spans under RPC chatter.
- Write token resolves via `LOGFIRE_TOKEN` env or `apps/jurat/.logfire/logfire_credentials.json` (git-ignored; written by the Logfire agent-setup wizard, never committed).
