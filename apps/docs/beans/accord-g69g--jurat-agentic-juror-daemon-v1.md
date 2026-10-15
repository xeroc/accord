---
# accord-g69g
title: Jurat — agentic juror daemon (v1)
status: todo
type: milestone
priority: high
created_at: 2026-10-15T07:31:47Z
updated_at: 2026-10-15T07:31:47Z
---

# Jurat — agentic juror daemon (v1)

`apps/jurat` — an autonomous Solana juror operator for the Accord arbitration
protocol. One daemon, one hot operator keypair: it stakes into attractive
Subaccords, watches for its own seats being drawn, runs an LLM agent over the
dispute evidence, and votes commit/reveal. Binary: `jurat`. Private package,
consumes `@useaccord/sdk`.

Name: a **jurat** is a sworn officer who judges (Channel-Islands royal-court
jurors are called jurats to this day); etymological root of "juror". Same
register as Canon / Synod / Hanse.

## Design decisions (grill 2026-10-15)

1. **Scope — full auto-vote pipeline behind `DRY_RUN` (default ON).** Verdict →
   Telegram always; commit+reveal wired from day one but gated by
   `JURAT_DRY_RUN`. Flipping the flag makes it autonomous. No vote-shaped tx
   leaves the process unless the gate is off.
2. **Agent context — evidence pipeline + domain doc, no web tools.** Jurat
   registers an X25519 delivery key (ADR-0034) and receives decrypted evidence
   bundles for disputes it is drawn into; agent context = evidence files +
   Subaccord domain doc + on-chain dispute/round state. No browser/search tools
   in v1.
3. **Join gates — full conservative set, all config-driven:**
   `staking_token` AND `fee_token` on allowlist; `min_stake` and
   `fee_per_juror` within configured ranges; `alpha_bps` ≤ cap;
   `aggregation == Plurality` (Median/scalar deferred to v2); `commit_window`
   ≥ floor (agent runtime budget); global stake budget + per-subaccord cap +
   reserve floor (never stake below configured remaining balance).
4. **Monitoring — WS log subscription as hints + boot/periodic reconcile as
   truth** (evidence-daemon `chain/events.ts` pattern): subscribe to program
   logs (`SubaccordCreated`, `SeatDrawn`, `Redrawn`, `DisputeCreated`);
   accounts are authoritative (`Subaccord` via `getProgramAccounts`,
   `Round.jurors[]` for duty membership). Restart-safe by construction.
5. **Isolation — in-process tool allowlist with a Docker seam.** Agent runs
   in-process with a fixed read-only toolset (read chain, fetch evidence, read
   domain doc) + structured verdict output. On-chain vote is built by daemon
   code from the verdict schema — the agent never touches keys, shell, or
   arbitrary IO. Threat model: dispute evidence is attacker-controlled text
   (prompt injection); worst case bounded to a bad vote (and DRY_RUN until
   proven). `runVerdict(inputs) → Verdict` seam so a container backend can
   drop in later without rework.
6. **AI library — Vercel AI SDK stack:** `ai` +
   `@ai-sdk/openai-compatible` (`createOpenAICompatible({ baseURL, apiKey })`)
   for the pluggable provider requirement; `tool()` + Zod for custom tools;
   `@ai-sdk/mcp@2` stable `createMCPClient` for MCP servers; agent loop via
   `generateText({ tools, stopWhen: stepCountIs(n) })`. Retry ladder: primary
   endpoint → fallback endpoint → abstain.
7. **Vote timing — ASAP.** Commit as soon as a valid verdict exists (within
   the commit window), reveal at reveal-window open. Never sit on a secret.
   Salt: random 32 B per dispute, persisted in local state until reveal.
   `commitHash`/`commit`/`reveal` from the SDK. Plurality option index votes
   only (gate 3).
8. **Failure policy — retry ladder → clean abstain.** Never cast a default /
   garbage vote: abstention risk is accepted, Telegram alert fires, no fake
   Schelling signal.
9. **Identity & funds — single operator key, manual top-up.** One keypair per
   instance (path in env); SOL + allowlisted staking tokens topped up
   manually; reserve-floor gate in the join evaluator. No auto-swap, no
   multi-persona (Sybil-smell).

## Non-goals (v1)

Median/scalar pools, web tools, Docker runtime, auto token acquisition,
multiple juror personas, domain-doc parsing as a join gate (v2 candidate),
auto-unstake/exit policy.

## Surfaces

- Monorepo placement: `apps/jurat`, package `@useaccord/jurat` (private).
- SDK: `@useaccord/sdk` for PDAs, decoders, `stake`, `commit`, `reveal`.
- Evidence: evidence-daemon HTTP + delivery keys (ADR-0034).
- Notify: Telegram Bot API (token + chat id in env), behind a tiny channel
  interface for future channels.
- State: local JSON state dir (duties, salts, cursor, joined-subaccord book).
- Docs: ADR-0036 (this decision set), `apps/jurat/SPEC.md`, README,
  `.env.example`.
- Verification: TDD; mock openai-compatible HTTP server for deterministic
  agent tests; Surfpool e2e exercising join → dispute → draw → verdict →
  commit → reveal green (dryRun off in test).

## Bean tree

Epic 1 Skeleton & runtime → scaffold, config, chain client.
Epic 2 Chain watch → event subscriber, reconcile scan, join gates, join executor.
Epic 3 Duty pipeline → duty tracker, evidence intake, agent runner (AI SDK,
tools/MCP, verdict schema), vote executor (commit, reveal, failure path).
Epic 4 Notifications, docs & verification → Telegram notifier, ADR/SPEC docs,
mock-LLM test rig, Surfpool e2e green.
