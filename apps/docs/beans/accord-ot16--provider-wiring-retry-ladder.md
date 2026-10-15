---
# accord-ot16
title: Provider wiring & retry ladder
status: completed
type: task
created_at: 2026-10-15T07:32:42Z
updated_at: 2026-10-15T13:05:00Z
parent: accord-sglt
---

src/agent/provider.ts: createOpenAICompatible primary+fallback from config; retry with backoff primary→fallback→fail. AC: unit tests with stub HTTP (flaky primary → fallback used; both fail → error).

## Summary of Changes

- `apps/jurat/src/agent/provider.ts`:
  - `ProviderEndpoint { name, baseURL, apiKey, modelId }` (fed from operator
    config by the config module, accord-jxpn) + `createProviderModel()` via
    `createOpenAICompatible`.
  - `runOnLadder(models, op, options, isFatal)` — each endpoint gets
    `retriesPerEndpoint` attempts with exponential backoff
    (`initialBackoffMs`, `backoffFactor`, injectable `sleep`); a fatal error
    rethrows immediately. Exhaustion → `RetryLadderExhaustedError` carrying
    the per-attempt log (pipeline abstains with kind
    `retry-ladder-exhausted`).
  - `makeLadderVerdictRunner(primary, fallback?, options)` — composes the
    ladder with the verdict runner: transport/API failures advance
    primary → fallback; `MalformedVerdictError` short-circuits (a model
    that answered with garbage is not re-rolled — nondeterministic re-asks
    are how default votes sneak in, decision 8).
- `apps/jurat/src/agent/runner.ts` — `maxRetries: 0` on `generateText`:
  the SDK's internal retry would multiply every ladder attempt (observed
  3 HTTP calls per attempt before the fix); the ladder owns retries.
- `apps/jurat/src/agent/provider.test.ts` — 6 node:test cases against two
  stub openai-compatible HTTP servers: healthy primary (fallback never
  contacted), flaky primary recovers in place with one backoff sleep,
  dead primary → fallback used, both dead → `RetryLadderExhaustedError`
  with all attempts burned, single-endpoint exhaustion, malformed-verdict
  short-circuit (no fallback burn).
- Verified: `pnpm --filter @useaccord/jurat test` 45/45 green; `pnpm -r
  run build` + `pnpm -r run lint` green workspace-wide.
