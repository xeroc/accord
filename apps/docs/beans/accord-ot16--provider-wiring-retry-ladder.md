---
# accord-ot16
title: Provider wiring & retry ladder
status: todo
type: task
created_at: 2026-10-15T07:32:41Z
updated_at: 2026-10-15T07:32:41Z
parent: accord-sglt
---

src/agent/provider.ts: createOpenAICompatible primary+fallback from config; retry with backoff primary→fallback→fail. AC: unit tests with stub HTTP (flaky primary → fallback used; both fail → error).
