---
"@useaccord/jurat": patch
---

feat(jurat): duty pipeline — commit path, failure path, duty tracker, agent toolset, verdict runner, provider ladder, reveal path

- Commit path (`src/vote/commit.ts`): 32-byte salt generation with persist-before-send, SDK `commitHash`+`commit` wiring gated to the on-chain commit window `[review_end, commit_end)`, and a `DRY_RUN` gate that logs + notifies instead of sending a transaction (bean accord-0ytn).
- Failure path (`src/duty/failures.ts` + `src/duty/types.ts`): every failure source maps to a persisted abstention + Telegram alert; the module structurally cannot cast a vote (bean accord-5mpb).
- Duty tracker (`src/duty/tracker.ts`): decoded `Round` → `DutyRecord` for our seat (`Round.jurors[0..juror_count)`), chain-clock window math mirroring the commit.rs/reveal.rs gates (incl. early reveal on full panel), ADR-0021 redraw supersession (same round_idx, attempt+1 → fresh duty or `redrawn-out` closure), idempotent reconcile rescan (bean accord-fgxw).
- Agent toolset (`src/agent/tools.ts`): four Zod-typed read-only tools (read_dispute, read_subaccord, fetch_evidence_file, read_domain_doc) over injected seams, MCP servers from config via `@ai-sdk/mcp` `createMCPClient`, merged behind the builtin set (builtin wins on collision); no key/shell/fs-write surface exists (bean accord-gww8).
- Verdict runner (`src/agent/runner.ts`): `runVerdict(AgentContext) → Verdict` via `generateText({ tools, stopWhen: stepCountIs })` + `Output.object` structured output; `VerdictRunner` interface as the container seam; malformed, schema-invalid, or out-of-bounds verdicts throw `MalformedVerdictError` (pipeline abstains, never repairs) (bean accord-o2dc).
- Provider ladder (`src/agent/provider.ts`): `createOpenAICompatible` primary+fallback endpoints with in-place exponential-backoff retries (`maxRetries: 0` on the SDK — the ladder owns retries), `RetryLadderExhaustedError` when both burn out; malformed verdicts short-circuit the ladder instead of re-rolling (bean accord-ot16).
- Reveal path (`src/vote/reveal.ts`): reveal at window open (incl. the reveal.rs all-committed early open) with the exact persisted salt+vote, DRY_RUN gate, idempotent; salt loss alerts and throws `SaltLostError` — a wrong guess is a guaranteed on-chain RevealMismatch, so none is ever tried (bean accord-qk0q).
