---
# accord-o2dc
title: Verdict schema & runVerdict seam
status: completed
type: task
created_at: 2026-10-15T07:32:42Z
updated_at: 2026-10-15T12:10:00Z
parent: accord-sglt
---

src/agent/runner.ts: runVerdict(AgentContext)→Verdict {optionIndex, rationale, confidence} structured output, generateText tools+stopWhen stepCountIs; interface so a container backend can replace it. AC: unit tests vs mock openai-compatible server incl. malformed/invalid verdict rejection.

## Summary of Changes

- `apps/jurat/src/agent/runner.ts`:
  - `Verdict {optionIndex, rationale, confidence}` + `verdictSchema` (zod:
    int ≥ 0, non-empty rationale, confidence 0..1) — the wire shape the
    model must produce and the vote executor consumes.
  - `makeAgentRunner(model, systemPrompt?)` → `VerdictRunner` with
    `runVerdict(AgentContext)`: `generateText({ tools, stopWhen:
    stepCountIs(maxSteps ?? 8), output: Output.object({ schema }) })` per
    milestone decision 6. `AgentContext` carries dispute/subaccord
    addresses, `numOptions`, the read-only toolset, and the step budget.
  - Rejection policy: the SDK's own structured-output validation surfaces
    as `NoObjectGeneratedError` → wrapped in `MalformedVerdictError`
    (transport/API errors propagate untouched — the retry ladder,
    accord-ot16, owns those); output is re-validated against the schema and
    bounded to `numOptions`. Never repaired, never defaulted — callers
    abstain (failures.ts kind `malformed-verdict`).
  - `VerdictRunner` interface is the container seam (decision 5): a
    sandboxed backend implements it, pipeline unchanged.
  - System prompt pins the honesty Schelling point and treats evidence
    content as untrusted text (prompt-injection threat model).
- `apps/jurat/src/agent/runner.test.ts` — 5 node:test cases against a
  mock openai-compatible HTTP server (`node:http` /chat/completions,
  tool-phase vs structured-output-phase detection via `response_format`):
  happy-path verdict parse + dispute address reaching the prompt, prose
  (non-JSON) rejection, schema-invalid rejection, out-of-bounds
  optionIndex rejection, verdictSchema shape pin.
- `apps/jurat/package.json` — `@ai-sdk/openai-compatible@^3` added (test
  rig + provider used by accord-ot16).
- Verified: `pnpm --filter @useaccord/jurat test` 39/39 green; `pnpm -r
  run build` + `pnpm -r run lint` green workspace-wide.
