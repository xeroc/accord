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
| Trace sink (ADR-0037 push leg) | `src/trace/sink.ts` + runtime emitters | Landed (beans `accord-9pdg` + `accord-w4j7`) |

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
- Container runtime: `apps/jurat/Dockerfile` (workspace pnpm + bun image,
  `ghcr.io/xeroc/useaccord-jurat` from the Release workflow). State lives in
  `JURAT_STATE_DIR` (volume `/app/state`); the operator keypair is mounted
  read-only at `JURAT_KEYPAIR_PATH`.

## Out of scope (v1)

Median/scalar pools, web/search tools, auto token acquisition, multiple
juror personas, domain-doc parsing as a join gate, auto-unstake/exit policy.

## Chain interface

All chain access via `@useaccord/sdk` (PDAs, decoders, facades — never a
second hand-rolled implementation):

- **Writes:** `stake` (join executor), `commit`, `reveal` (vote executor).
- **Reads:** `Subaccord` (join evaluation — `getProgramAccounts` scan),
  `Dispute` / `Round` (duty state, windows, `Round.jurors[]` membership),
  `JurorStake` (own position — the scan's own-stake PDA read powers
  already-joined recognition; plus `fees_earned`), SAS `Attestation`
  (credential-gated pools — `findSasAttestation` memcmp scan, ADR-0024),
  `Ruling` (post-settlement observation).
- Program logs subscription for hint events; accounts are authoritative.
  The hint layer (`makeHintHandlers`, `src/runtime.ts`) filters `SeatDrawn`
  to our operator key: our seat landing is identified right away — logged +
  alerted to the operator as "duty received" — and kicks an off-cycle scan.
  Foreign seats are ignored; the scan re-verifies membership against
  `Round.jurors[]` before anything is acted on.

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
commit window; reveal at reveal-window open — or immediately, when our own
commit completes the panel (pre-commit `commit_count + 1 === juror_count`):
the chain's early-open relaxation (`reveal.rs`) already admits the reveal, so
the same pass sends it instead of idling out the commit window. The salt
lives in local state from verdict until reveal — losing it makes the commit
unrevealable (accepted risk; the state dir is backed up like a hot wallet's
memory).

## Join evaluator gates

A Subaccord is joinable only when ALL gates pass (ADR-0036; every knob in
config):

| Gate | Rule |
| --- | --- |
| Staking token | `staking_token` ∈ allowlist |
| Fee token | `fee_token` ∈ allowlist |
| Min stake | `min_stake` within `[min, max]` configured range and > 0 (zero-minimum pools carry no draw weight) |
| Fee per juror | `fee_per_juror` within configured range |
| Coherence | `alpha_bps` ≤ configured cap |
| Aggregation | `aggregation == Plurality` (v1) |
| Commit window | `commit_window` ≥ configured floor (agent runtime budget) |
| Budget | pool `min_stake` (the join amount) not over the per-Subaccord cap; per-token global stake budget not exceeded; reserve floor retained (never stake below configured remaining balance) |

Two executor-level rules sit beside the gates (both chain-read, so not in the
pure evaluator):

- **Attestation gate (ADR-0024):** a credential-gated Subaccord
  (`juror_credential`/`juror_schema` set) is joined only with the juror's
  matching SAS attestation, resolved per join and passed to `stake`; no
  matching attestation ⇒ reject `AttestationGated` — no join. Binding/expiry
  validity is the on-chain gate's call.
- **Already joined:** every scan reads the juror's own `JurorStake` per pool;
  a live stake (`staked > 0`) is never re-offered to the join gates — the
  scan reports it as a held stake and the local join book heals from it, so
  budget accounting counts real on-chain exposure (wiped state dir, manual
  stake, second instance). A drained slot (`staked == 0`) stays joinable —
  re-staking regains draw weight.

## Agent runner

`runVerdict(inputs) → Verdict` — the seam a container backend can replace
(ADR-0036 isolation decision). v1 runs in-process:

- **Stack:** `ai` + `@ai-sdk/openai-compatible` (`createOpenAICompatible({
  baseURL, apiKey })`), `tool()` + Zod for the read-only toolset, agent loop
  via `generateText({ tools, stopWhen: stepCountIs(n) })` with
  `Output.object` structured verdicts.
- **Forced investigation (two-phase runner):** phase 1 runs the tool loop
  with `toolChoice: "required"` on step 0 and **no** output spec — on
  endpoints like z.ai, `response_format` on the wire overrides
  `tool_choice` (the model answers immediately, SDK
  `ToolChoiceViolationError`). Phase 2 re-asks with `Output.object` over
  the full investigation transcript (tools absent, so nothing competes
  with `response_format`). A model that still answers without tools, or a
  run with zero tool calls, is a `MalformedVerdictError` → clean abstain,
  never a vote. Phase-1 text is never trusted as the verdict.
- **Trace tap (ADR-0037):** optional `AgentContext.trace` emits `agent-start`
  before the investigation call and one redacted `step` event per phase-1
  model step — builtin tool args verbatim (the closed set in `BUILTIN_TOOL_NAMES`), MCP args digest-only, tool
  results always sha256-digest-only over canonical JSON (sorted keys, no
  whitespace); no evidence content or intermediate model text is ever
  traced. The phase-2 extraction re-ask emits no step events (it runs
  tool-less; its outcome is the `verdict` event).
- **Tools (read-only, fixed):** read chain (dispute/round/subaccord), fetch
  evidence files, read domain doc, `read_case` (Inveigo: boss Item +
  claim-hash-verified thesis, resolved via `Item.current_dispute` — see
  `src/chain/inveigo.ts`). No shell, no keys, no arbitrary IO. Tool outputs
  are deep-converted to JSON-wire-safe data first (BigInt → decimal
  string) — decoded accounts would otherwise crash the follow-up request
  serialization.
- **Output:** structured `Verdict` — `{ optionIndex: number, rationale:
  string, confidence: number }` (Zod-checked, bounded to `num_options`);
  the vote tx is built from the schema by daemon code.
- **Retry ladder:** primary endpoint → fallback endpoint → clean abstain
  (+ Telegram alert). Never a default vote. Malformed/uninvestigated
  verdicts short-circuit the ladder (no re-roll).

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
| `JURAT_TRACE_URL` | ADR-0037 trace push — evidence-daemon base URL (unset = no-op sink) | optional |
| `JURAT_TRACE_MODE` | `sealed` (verdict withheld until `unsealAt`) / `open` (demo, release at push); requires `JURAT_TRACE_URL` | `sealed` |
| `JURAT_LLM_BASE_URL` / `JURAT_LLM_FALLBACK_BASE_URL` | openai-compatible endpoints | required / optional |
| `JURAT_LLM_API_KEY` / `JURAT_LLM_MODEL` | Provider credentials / model id | required |
| `JURAT_STAKING_TOKENS` | Comma-separated collateral mints | required |
| `JURAT_FEE_TOKENS` | Comma-separated fee mints | required |
| `JURAT_MIN_STAKE_MIN` / `JURAT_MIN_STAKE_MAX` | Acceptable `min_stake` range | `0` / unbounded |
| `JURAT_FEE_PER_JUROR_MIN` / `JURAT_FEE_PER_JUROR_MAX` | Acceptable `fee_per_juror` range | `0` / unbounded |
| `JURAT_ALPHA_BPS_CAP` | Coherence cap | `2000` |
| `JURAT_COMMIT_WINDOW_FLOOR` | Minimum commit window seconds (agent runtime budget) | `600` |
| `JURAT_STAKE_BUDGET` | Global stake budget (per staking token) | required |
| `JURAT_SUBACCORD_CAP` | Per-Subaccord stake cap | required |
| `JURAT_RESERVE_FLOOR` | Never stake below this remaining balance | required |
| `JURAT_MIN_SOL_LAMPORTS` | SOL floor for tx fees (join executor guard) | `50000000` |
| `JURAT_LOG_LEVEL` / `LOG_LEVEL` | Logging level (winston); `debug` traces verdict resolution — prompts, ⚒ tool calls, model response | `info` |
| `JURAT_LOGFIRE` | `1`/`true` exports OTel spans (every AI SDK call + winston logs) to Pydantic Logfire (`xeroc/inveigo`, eu) via `@pydantic/logfire-node`; token from `LOGFIRE_TOKEN` or `.logfire/logfire_credentials.json` | `false` |
| `JURAT_LOGFIRE_SERVICE` | Logfire `service.name` | `jurat` |

Names/defaults are implemented in `src/config.ts` (bean `accord-jxpn` +
`accord-vruh`); `.env.example` is the copy-paste surface.

## Failure modes

| Failure | Behavior |
| --- | --- |
| LLM endpoints both fail | Clean abstain + Telegram alert; no vote |
| Verdict fails schema check | Treated as agent failure → retry ladder → abstain |
| Evidence fetch fails | Duty holds until intake succeeds or commit window closes → abstain + alert |
| Telegram send fails | Logged via `onError`; pipeline continues (never-reject contract) |
| Trace push fails / endpoint dead | Batch dropped (warn log, visible seq gaps); duty pipeline unaffected (ADR-0037) |
| Missed events (restart) | Reconcile scan reconstructs duties from accounts; in-flight commit salts are unrecoverable (accepted) |
| Key balance below reserve floor | Join evaluator stops staking; alert |

## Verification

- **Unit (bun test, colocated):** notify (landed), mock LLM rig (landed —
  `src/agent/testing/`, proven against the real `@ai-sdk/openai-compatible`
  client), config parsing, join evaluator gate table, agent runner against
  the rig (deterministic responses, retry-ladder paths), vote executor
  salt/commit/reveal building.
- **e2e (Surfpool, dryRun OFF):** `tests/src/jurat.spec.ts` — the staged duty
  loop (auto-join → dispute → VRF draw → mock-LLM verdict → commit →
  reveal; `Round.reveals` + the verdict notice asserted) plus the failing-LLM
  twin (ladder exhausted → abstain + alert, no vote) and the **armed-loop**
  test: the real `runDaemon` booted against Surfpool with `dryRun=false`,
  whose own scan discovers the drawn duty, commits, and reveals — no stage
  hand-driven.
