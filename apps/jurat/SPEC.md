# Jurat — Agentic Juror Daemon — v1 Build Specification

> **Status:** in construction (v1). Authority: ADR-0036 (decision set),
> `apps/docs/beans/` (bean map), this file (implementation reference:
> architecture, gates, duty flow, config surface). Code is authority on
> current state; this spec is authority on intent. Landed modules are marked
> below; everything else is specified-not-yet-built.

## Overview

`apps/jurat` is the **autonomous juror operator** for the Accord arbitration
protocol: a standalone off-chain TypeScript/Bun daemon (`jurat`, private
package `@useaccord/jurat`) holding **one hot operator keypair**. It:

1. **Stakes** into Subaccords that pass a conservative, config-driven filter.
2. **Watches** the Accord program for its own seats being drawn (log hints +
   account truth).
3. **Intakes evidence** — decrypted bundles via its registered X25519
   Delivery Key (ADR-0034) at the evidence daemon.
4. **Runs an LLM agent** over evidence + Subaccord domain doc + on-chain
   dispute/round state → structured verdict (Vercel AI SDK, pluggable
   openai-compatible endpoint).
5. **Votes** commit → reveal through `@useaccord/sdk` — gated behind
   `JURAT_DRY_RUN` (default ON: no vote-shaped tx leaves the process).
6. **Reports** every verdict + operational alert to Telegram (always,
   DRY_RUN-independent).

Failure policy: retry ladder → **clean abstain**. Never a default or garbage
vote — a fake Schelling signal is worse than silence.

## Module map (implementation status)

| Module | Path | Status |
| --- | --- | --- |
| Package scaffold (bun + tsc + eslint) | `package.json`, `tsconfig.json`, `eslint.config.js` | Landed |
| Notify channel interface + Telegram | `src/notify/` | Landed (bean `accord-4qyb`) |
| Config (env → typed config) | `src/config.ts` | Landed |
| Chain client (RPC, decoders, SDK facades) | `src/chain/client.ts` | Landed |
| Event subscriber (log hints) | `src/chain/events.ts` | Landed |
| Reconcile scan (account truth) | `src/chain/reconcile.ts` | Landed |
| Join evaluator + executor | `src/join/` | Landed |
| Duty tracker (Round.jurors[] membership) | `src/duty/tracker.ts` | Landed |
| Evidence intake (Delivery Key registration + fetch) | `src/duty/evidence.ts` | Landed |
| Agent runner (`runVerdict(inputs) → Verdict`) | `src/agent/` | Landed (mock rig: `src/agent/testing/`) |
| Provider ladder (primary → fallback) | `src/agent/provider.ts` | Landed |
| Vote executor (commit/reveal, salts) | `src/vote/` | Landed |
| Local state store (duties, votes, join book) | `src/state/stores.ts` + `src/join/book.ts` | Landed |
| Daemon runtime (scan loop + duty state machine) | `src/runtime.ts` | Landed (bean `accord-vruh`) |
| Entry point / loop | `src/main.ts` | Landed (bean `accord-vruh`) |

## In scope (v1)

- Single operator keypair (path in env); SOL + allowlisted staking tokens
  topped up manually.
- Full join-gate set (below), all config-driven.
- WS log subscription (`SubaccordCreated`, `SeatDrawn`, `Redrawn`,
  `DisputeCreated`) as hints; `Subaccord` via `getProgramAccounts` and
  `Round.jurors[]` as truth; boot + periodic reconcile.
- Evidence bundles for drawn duties via Delivery Key; agent context =
  evidence files + domain doc + on-chain dispute/round state. No web tools.
- In-process agent with fixed read-only toolset; verdict is a
  schema-checked `Verdict`; the vote tx is built by daemon code, never by
  the agent.
- Plurality option-index votes only; commit ASAP within the window, reveal
  at reveal-window open; random 32 B salt per dispute persisted until
  reveal.
- Telegram verdict + alert messages (channel interface for future sinks).

## Out of scope (v1)

Median/scalar pools, web/search tools, Docker runtime, auto token
acquisition, multiple juror personas, domain-doc parsing as a join gate,
auto-unstake/exit policy.

## Chain interface

All chain access via `@useaccord/sdk` (PDAs, decoders, facades — never a
second hand-rolled implementation):

- **Writes:** `stake` (join executor), `commit`, `reveal` (vote executor).
- **Reads:** `Subaccord` (join evaluation — `getProgramAccounts` scan),
  `Dispute` / `Round` (duty state, windows, `Round.jurors[]` membership),
  `JurorStake` (own position, `fees_earned`), `Ruling` (post-settlement
  observation).
- Program logs subscription for hint events; accounts are authoritative.

## Duty flow

```
            ┌───────────────────────────── daemon loop ─────────────────────────────┐
            │                                                                        │
  SubaccordCreated ──▶ join evaluator ──pass──▶ stake (budget/cap/reserve-checked)  │
            │                 └──skip──▶ (log)                                      │
            │                                                                        │
  SeatDrawn/Redrawn ─▶ hint ─▶ duty tracker ── mine (Round.jurors[]) ──▶ duty open  │
            │                          └── not mine ──▶ ignore                     │
            │                                                                        │
  duty open ─▶ evidence intake (Delivery Key fetch) ─▶ agent runner ── Verdict ─┐   │
            │                                        └─ retry ladder exhausted ─┐│   │
            │                                                                   ▼▼   │
            │              Telegram verdict (always) ── DRY_RUN off ──▶ commit  │   │
            │              Telegram alert (abstain path)          └─▶ (no tx)  │   │
            │                                                                        │
  reveal window opens ─▶ reveal(salt, option) ─▶ duty closed ─▶ prune salt        │
            │                                                                        │
  boot / periodic ─▶ reconcile scan (accounts = truth; recovers cursor, duties)   │
            └────────────────────────────────────────────────────────────────────────┘
```

Vote timing is ASAP: commit as soon as a valid verdict exists inside the
commit window; reveal at reveal-window open. The salt lives in local state
from verdict until reveal — losing it makes the commit unrevealable (accepted
risk; the state dir is backed up like a hot wallet's memory).

## Join evaluator gates

A Subaccord is joinable only when ALL gates pass (ADR-0036; every knob in
config):

| Gate | Rule |
| --- | --- |
| Staking token | `staking_token` ∈ allowlist |
| Fee token | `fee_token` ∈ allowlist |
| Min stake | `min_stake` within `[min, max]` configured range |
| Fee per juror | `fee_per_juror` within configured range |
| Coherence | `alpha_bps` ≤ configured cap |
| Aggregation | `aggregation == Plurality` (v1) |
| Commit window | `commit_window` ≥ configured floor (agent runtime budget) |
| Budget | global stake budget not exceeded + per-Subaccord cap + reserve floor (never stake below configured remaining balance) |

## Agent runner

`runVerdict(inputs) → Verdict` — the seam a container backend can replace
(ADR-0036 isolation decision). v1 runs in-process:

- **Stack:** `ai` + `@ai-sdk/openai-compatible` (`createOpenAICompatible({
  baseURL, apiKey })`), `tool()` + Zod for the read-only toolset, agent loop
  via `generateText({ tools, stopWhen: stepCountIs(n) })`.
- **Tools (read-only, fixed):** read chain (dispute/round/subaccord), fetch
  evidence files, read domain doc. No shell, no keys, no arbitrary IO.
- **Output:** structured `Verdict` — `{ option: number, rationale: string,
  confidence: number }` (Zod-checked); the vote tx is built from the schema
  by daemon code.
- **Retry ladder:** primary endpoint → fallback endpoint → clean abstain
  (+ Telegram alert). Never a default vote.

## Notify channel

Landed (`src/notify/`). `NotifyChannel` interface: `verdict(VerdictNotice)` /
`alert(message)`; both **never reject** — send failures (throw, non-ok HTTP,
hang past timeout) surface via `onError` and resolve, so a flapping Telegram
can never crash or stall the duty pipeline. Telegram implementation:
plain-text verdict (dispute, option, confidence %, DRY RUN/LIVE flag,
rationale capped at 3500 chars) + alerts, posted to the Bot API
`sendMessage` endpoint.

## Config surface (env → typed config)

| Env | Meaning | Default |
| --- | --- | --- |
| `JURAT_RPC_URL` | Solana RPC endpoint | required |
| `JURAT_WS_URL` | WS endpoint (send confirm + log hints) | derived from RPC URL |
| `JURAT_KEYPAIR_PATH` | Operator keypair (hot) | required |
| `JURAT_DRY_RUN` | Vote gate — `true` blocks all vote-shaped tx | `true` |
| `JURAT_STATE_DIR` | Local state (duties, votes, join book) | `./state` |
| `JURAT_SCAN_INTERVAL_MS` | Reconcile scan interval (the truth loop) | `60000` |
| `JURAT_TELEGRAM_TOKEN` / `JURAT_TELEGRAM_CHAT_ID` | Notify channel (both or none; unset = stdout) | optional |
| `JURAT_EVIDENCE_URL` | Evidence daemon base URL (both or none; unset = duties hold, join watch still runs) | optional |
| `JURAT_DELIVERY_KEY_PATH` | X25519 Delivery Key file (ADR-0034), created on first run | optional (pair) |
| `JURAT_LLM_BASE_URL` / `JURAT_LLM_FALLBACK_BASE_URL` | openai-compatible endpoints | required / optional |
| `JURAT_LLM_API_KEY` / `JURAT_LLM_MODEL` | Provider credentials / model id | required |
| `JURAT_STAKING_TOKENS` | Comma-separated collateral mints | required |
| `JURAT_FEE_TOKENS` | Comma-separated fee mints | required |
| `JURAT_STAKE_AMOUNT` | Amount staked per join | required |
| `JURAT_MIN_STAKE_MIN` / `JURAT_MIN_STAKE_MAX` | Acceptable `min_stake` range | `0` / unbounded |
| `JURAT_FEE_PER_JUROR_MIN` / `JURAT_FEE_PER_JUROR_MAX` | Acceptable `fee_per_juror` range | `0` / unbounded |
| `JURAT_ALPHA_BPS_CAP` | Coherence cap | `2000` |
| `JURAT_COMMIT_WINDOW_FLOOR` | Minimum commit window seconds (agent runtime budget) | `600` |
| `JURAT_STAKE_BUDGET` | Global stake budget (in each staking token) | required |
| `JURAT_SUBACCORD_CAP` | Per-Subaccord stake cap | required |
| `JURAT_RESERVE_FLOOR` | Never stake below this remaining balance | required |
| `JURAT_MIN_SOL_LAMPORTS` | SOL floor for tx fees (join executor guard) | `50000000` |

Names/defaults are implemented in `src/config.ts` (bean `accord-jxpn` +
`accord-vruh`); `.env.example` is the copy-paste surface.

## Failure modes

| Failure | Behavior |
| --- | --- |
| LLM endpoints both fail | Clean abstain + Telegram alert; no vote |
| Verdict fails schema check | Treated as agent failure → retry ladder → abstain |
| Evidence fetch fails | Duty holds until intake succeeds or commit window closes → abstain + alert |
| Telegram send fails | Logged via `onError`; pipeline continues (never-reject contract) |
| Missed events (restart) | Reconcile scan reconstructs duties from accounts; in-flight commit salts are unrecoverable (accepted) |
| Key balance below reserve floor | Join evaluator stops staking; alert |

## Verification

- **Unit (bun test, colocated):** notify (landed), mock LLM rig (landed —
  `src/agent/testing/`, proven against the real `@ai-sdk/openai-compatible`
  client), config parsing, join evaluator gate table, agent runner against
  the rig (deterministic responses, retry-ladder paths), vote executor
  salt/commit/reveal building.
- **e2e (Surfpool, dryRun OFF):** `tests/src/jurat.spec.ts` — the full duty
  loop green (auto-join → dispute → VRF draw → mock-LLM verdict → commit →
  reveal; `Round.reveals` + the verdict notice asserted) plus the failing-LLM
  twin (ladder exhausted → abstain + alert, no vote) (the milestone's
  non-negotiable).
