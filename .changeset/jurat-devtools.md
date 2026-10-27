---
"@useaccord/jurat": patch
---

Jurat: LLM observability + verdict-agent harness hardening (two-phase runner).

- `JURAT_DEVTOOLS=1` registers AI SDK DevTools, capturing every verdict-agent step (prompts, tool calls, responses) to `.devtools/generations.json` for the `npx ai-tools` viewer; request/response bodies are retained on every run.
- Harness prompts prescribe a concrete investigation protocol with grounded PDAs (`read_domain_doc` → rubric-mandated reads (`read_case` on Inveigo) → `read_dispute` → `fetch_evidence_file` for every listed file) and forbid prior-only verdicts.
- Two-phase runner: phase 1 investigates with tools and forced step-0 `toolChoice: "required"` (no output spec — `response_format` overrides `tool_choice` on endpoints like z.ai, making the model answer immediately); phase 2 extracts the structured verdict via `Output.object` from the full investigation transcript. A model that answers without tools (SDK `ToolChoiceViolationError`) or a run with zero tool calls is a `MalformedVerdictError` → clean abstain, never a vote, never re-rolled on the retry ladder.
- Tool outputs are deep-converted to JSON-wire-safe data (BigInt → decimal string) — decoded on-chain accounts previously crashed the follow-up request serialization (`Do not know how to serialize a BigInt`), exhausting the retry ladder on any real tool-using run.
- `read_dispute` now returns `{ account, evidenceFiles }` — the raw account carries evidence hashes, not file names, so the model previously had to guess `round-N` names that `fetch_evidence_file` rejects.
- Boot log now names the LLM endpoint + model.
