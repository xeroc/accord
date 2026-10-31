# @useaccord/jurat

## 0.8.4

### Patch Changes

- [#37](https://github.com/xeroc/accord/pull/37) [`9e03d99`](https://github.com/xeroc/accord/commit/9e03d99f975cb7d8ef8fe21b7ea1674daa04f137) Thanks [@xeroc](https://github.com/xeroc)! - Cranker: cut the juror-draw latency from ~2 poll cycles to seconds. A new
  `VrfLogListener` subscribes to the Accord program's log stream and dispatches
  the dispute the instant a `VrfCommitted` event lands (the deterministic draw
  trigger — the account-write notification alone could be missed). Scoped
  dispatches (account writes + VRF events) now ITERATE resolve→execute with
  fresh state instead of ending on the first action: a stale snapshot that
  resolves a now-skippable action no longer deadlocks the draw until the next
  60s cycle, and concurrent dispatches for one dispute coalesce into one run.
  `panelSizeForRound` now takes `dispute.terms.minJurySize` from chain instead
  of assuming the default panel of 3 — N=1 pools (Inveigo arena court) no longer
  burn sortition retries on phantom seats.

  Jurat: review-phase duties schedule a wake at `reviewEnd + 1s` (new optional
  `RuntimeDeps.scheduleWake`, wired to the daemon's off-cycle scan in main), so
  evidence + LLM start the moment the commit window opens instead of on the
  next scan tick (120s in deployment).

- [#37](https://github.com/xeroc/accord/pull/37) [`7419e10`](https://github.com/xeroc/accord/commit/7419e109fc0bbb5a070b754a9cfe0832ea1faf70) Thanks [@xeroc](https://github.com/xeroc)! - jurat: every WS hint event that triggers an action now logs an INFO line naming the event and its identifying accounts — `SeatDrawn` (our seat) logs juror + dispute (+round/seat), `SubaccordCreated` logs the subaccord, `DisputeCreated` logs dispute + subaccord, `Redrawn` logs dispute + round. Foreign `SeatDrawn` seats stay silent (no action, no log).
- Updated dependencies []:
  - @useaccord/sdk@0.8.4

## 0.8.3

### Patch Changes

- [#35](https://github.com/xeroc/accord/pull/35) [`81d5163`](https://github.com/xeroc/accord/commit/81d516367a05edaa4447a4169a42a692bf94a66c) Thanks [@xeroc](https://github.com/xeroc)! - sdk/jurat: fix every trace batch carrying a `step` event 403ing the daemon ingest (`signature does not verify for juror`, bean accord-r64v). `stepEvent` passes ai@7's `LanguageModelUsage` through raw, and its normalization materializes optional fields as explicit `undefined` (e.g. `inputTokenDetails.cacheWriteTokens`). jurat signs the canonical JSON of the IN-MEMORY batch while the daemon re-canonicalizes the parsed wire body — `Object.entries` kept those keys (rendered as literal `undefined`) while `JSON.stringify` drops them, desyncing the sha256 and failing Ed25519 verification. Observed live: all investigation-step batches dropped (MinIO trace gap 3–6), verdict/commit/reveal unaffected — same class as the earlier `unsealAt` fix. `canonicalJson` now mirrors `JSON.stringify` for `undefined` exactly (object entries skipped, array elements `null`), making the shared canonical form JSON-round-trip stable by construction. Pinned by an SDK wire-round-trip test and a jurat regression that drives the real provider normalization (mock-llm + real `@ai-sdk/openai-compatible`) and signs→wire→verifies the emitted step events.
- Updated dependencies [[`81d5163`](https://github.com/xeroc/accord/commit/81d516367a05edaa4447a4169a42a692bf94a66c)]:
  - @useaccord/sdk@0.8.3

## 0.8.2

### Patch Changes

- [#33](https://github.com/xeroc/accord/pull/33) [`272e9ca`](https://github.com/xeroc/accord/commit/272e9caa429c80ffb3cc4d994f4c37209ec25141) Thanks [@xeroc](https://github.com/xeroc)! - jurat: file-backed delivery-key storage no longer eats a key byte when the 64-byte keypair's last byte is `\r` followed by editor `\n` contamination (read as a `\r\n` pair, trimmed to 63 bytes, then rejected) — the trim now stops at 64 bytes. ui: storybook vitest project `testTimeout` raised to 60s; the default 15s starved long stories under full-suite browser parallelism.

- [#33](https://github.com/xeroc/accord/pull/33) [`7e7a6d7`](https://github.com/xeroc/accord/commit/7e7a6d7ecccdd4c1a0c82da429db31f1a06471ce) Thanks [@xeroc](https://github.com/xeroc)! - Jurat hint layer: `SeatDrawn` log hints are now filtered to the operator's own juror key. When our seat lands, the daemon immediately logs + Telegram-alerts "duty received: seat N on dispute D (round R)" and kicks an off-cycle reconcile scan; foreign seats no longer trigger full scans.

- [#33](https://github.com/xeroc/accord/pull/33) [`6c80903`](https://github.com/xeroc/accord/commit/6c8090330b7c03ebd53eaebf0df2efec3a423208) Thanks [@xeroc](https://github.com/xeroc)! - jurat: reveal immediately when the operator's commit completes the panel — the pre-commit `commit_count + 1 === juror_count` case now sends the reveal tx in the same duty pass instead of waiting for the commit window to elapse (on-chain reveal early-open already admits it).

- [#33](https://github.com/xeroc/accord/pull/33) [`f8febcd`](https://github.com/xeroc/accord/commit/f8febcdfcbe029174ef03331ec702c273231d953) Thanks [@xeroc](https://github.com/xeroc)! - jurat: fix ADR-0037 trace pushes rejected 403 by the evidence daemon

  Two bugs, both caught at the jurat↔daemon seam:

  1. `signTraceBatch` hex-encoded the Ed25519 signature while the daemon's
     ingest decodes `sig` as base64 (ADR-0037 wire format) — every push failed
     signature verification and was dropped with `[trace] push rejected (403)`.
     Now base64, hashed via the SDK's shared `buildTraceBatchMessage` (single
     canonical-form implementation).
  2. `JURAT_TRACE_MODE=open` stripped the verdict's `unsealAt` as
     `{ ...event, unsealAt: undefined }` — an explicitly-undefined key survives
     `Object.entries` in jurat's local canonical form (rendered `null`) but
     vanishes in the JSON wire form the daemon re-canonicalizes, desyncing the
     signature hash. Any batch containing a verdict frame still 403'd after (1).
     The key is now deleted before queueing.

  Pinned by a cross-contract test in jurat (sink sig → daemon-side
  `verifyTraceBatchSig`) and a new cross-app integration suite in the
  evidence-daemon (real sink over real HTTP → real ingest pipeline + FsTraceStore
  → replay via `GET /trace/:dispute`). Rejection warns now surface the daemon's
  `{"error":…}` reason body.

- Updated dependencies []:
  - @useaccord/sdk@0.8.2

## 0.8.1

### Patch Changes

- Updated dependencies []:
  - @useaccord/sdk@0.8.1

## 0.8.0

### Minor Changes

- [#27](https://github.com/xeroc/accord/pull/27) [`566d75c`](https://github.com/xeroc/accord/commit/566d75cd65a5eaee3b37fdd858976b3af5922ccf) Thanks [@xeroc](https://github.com/xeroc)! - Attestation-aware joining (ADR-0024 / PROG-ATTESTATION): the join executor no longer blanket-rejects credential-gated Subaccords. Gated pools resolve the juror's SAS attestation via `findSasAttestation` (credential+schema+subject memcmp) and thread it into the `stake` instruction; a gated pool with no matching attestation is rejected `AttestationGated` — no join. The lookup sits after on-chain idempotency so an already-joined pool never pays it. Scan iterations also recognize the juror's own on-chain JurorStake now: `reconcile` drops already-staked pools from `joinCandidates` and reports them as `heldStakes`, and the runtime heals the joined book from that — budgets count real on-chain exposure even after a wiped state dir or a manual stake (beans accord-pph6).

- [#27](https://github.com/xeroc/accord/pull/27) [`5c6f331`](https://github.com/xeroc/accord/commit/5c6f331b621137b7649f5aadd3054c1b48ba6c3d) Thanks [@xeroc](https://github.com/xeroc)! - Jurat: LLM observability via Pydantic Logfire.

  - `JURAT_LOGFIRE=1` exports every AI SDK 7 call (prompts, ⚒ tool calls, responses, token usage) plus winston log records as OpenTelemetry spans to Logfire (`xeroc/inveigo`, eu region) — `src/telemetry.ts` installs the global OTel provider via `@pydantic/logfire-node` and registers `@ai-sdk/otel`'s `OpenTelemetry` integration alongside the existing `JURAT_DEVTOOLS` capture (both can run together).
  - `JURAT_LOGFIRE_SERVICE` (default `jurat`) sets the `service.name`; auto http/fs instrumentations are disabled so the chain-polling loop doesn't bury LLM spans under RPC chatter.
  - Write token resolves via `LOGFIRE_TOKEN` env or `apps/jurat/.logfire/logfire_credentials.json` (git-ignored; written by the Logfire agent-setup wizard, never committed).

- [#27](https://github.com/xeroc/accord/pull/27) [`4e5c8d8`](https://github.com/xeroc/accord/commit/4e5c8d839ea27148c19649854902b73a37aa53c3) Thanks [@xeroc](https://github.com/xeroc)! - Builtin `read_case` tool: Inveigo disputes now reach the juror with full context. The round-0 evidence bundle carries only the challenger's anti-thesis; `read_case` resolves the boss `Item` via the unique live `Item.current_dispute` link (one `getProgramAccounts` scan, discriminator + dispute memcmp — same cross-program pattern as `findSasAttestation`), fetches the ORIGINAL THESIS from the evidence CAS at `Item.claim_hash`, and gates on `sha256(bytes) === claim_hash` — a tampered or wrong document throws, so the agent only ever sees the on-chain-committed thesis. Returns `null` for non-Inveigo disputes; `checks.courtMatches` cross-checks `Item.subaccord` against the dispute's court. Offsets mirror inveigo `state.rs` and are drift-pinned by that repo's `tests.rs::layout_pins`. The default system prompt now tells the juror the tool is required context on Inveigo disputes (hold-vs-flip framing lives in the court's domain doc).

- [#27](https://github.com/xeroc/accord/pull/27) [`ac69232`](https://github.com/xeroc/accord/commit/ac69232fb10483930c6a09f39a8377338eae5157) Thanks [@xeroc](https://github.com/xeroc)! - Duty-lifecycle trace emitters + runtime wiring (ADR-0037): the runtime binds a memoized per-duty TraceSink and emits duty-open at tracking, evidence (path + sha256 + bytes manifest) after intake, the sealed verdict (unsealAt = round.revealEnd in ms), commit/reveal tx events, and abstain; the agent step tap rides AgentContext.trace through the same sink; main.ts wires the RemoteTraceSink binder from JURAT_TRACE_* config (bean accord-w4j7).

- [#27](https://github.com/xeroc/accord/pull/27) [`c4de0d0`](https://github.com/xeroc/accord/commit/c4de0d0c1616b937b0bf187026d25fb7e207ea81) Thanks [@xeroc](https://github.com/xeroc)! - TraceSink + RemoteTraceSink (ADR-0037): sync never-throw emit with a bounded drop-oldest queue (256), signed Ed25519 batches (`{v, seq, events, sig}` over canonical JSON, 64-event chunks, 2s push timeout, drop-on-failure), no-op sink when JURAT_TRACE_URL is unset; JURAT_TRACE_MODE=sealed|open strips verdict unsealAt in open mode (bean accord-9pdg).

- [#27](https://github.com/xeroc/accord/pull/27) [`6e4e361`](https://github.com/xeroc/accord/commit/6e4e361ce497e869c40125ef1e048f8ab73ee87f) Thanks [@xeroc](https://github.com/xeroc)! - Agent step tap (ADR-0037): optional `AgentContext.trace` callback emits `agent-start` before the generation call and one redacted `step` event per model step — builtin-four tool args verbatim, MCP args digest-only, tool results always sha256-digest-only over canonical JSON; no evidence content or model text ever traced (bean accord-1nxb).

### Patch Changes

- [#27](https://github.com/xeroc/accord/pull/27) [`324965a`](https://github.com/xeroc/accord/commit/324965a48a04b2f4d17f6ef8081924ec3dfd2060) Thanks [@xeroc](https://github.com/xeroc)! - Jurat: LLM observability + verdict-agent harness hardening (two-phase runner).

  - `JURAT_DEVTOOLS=1` registers AI SDK DevTools, capturing every verdict-agent step (prompts, tool calls, responses) to `.devtools/generations.json` for the `npx ai-tools` viewer; request/response bodies are retained on every run.
  - Harness prompts prescribe a concrete investigation protocol with grounded PDAs (`read_domain_doc` → rubric-mandated reads (`read_case` on Inveigo) → `read_dispute` → `fetch_evidence_file` for every listed file) and forbid prior-only verdicts.
  - Two-phase runner: phase 1 investigates with tools and forced step-0 `toolChoice: "required"` (no output spec — `response_format` overrides `tool_choice` on endpoints like z.ai, making the model answer immediately); phase 2 extracts the structured verdict via `Output.object` from the full investigation transcript. A model that answers without tools (SDK `ToolChoiceViolationError`) or a run with zero tool calls is a `MalformedVerdictError` → clean abstain, never a vote, never re-rolled on the retry ladder.
  - Tool outputs are deep-converted to JSON-wire-safe data (BigInt → decimal string) — decoded on-chain accounts previously crashed the follow-up request serialization (`Do not know how to serialize a BigInt`), exhausting the retry ladder on any real tool-using run.
  - `read_dispute` now returns `{ account, evidenceFiles }` — the raw account carries evidence hashes, not file names, so the model previously had to guess `round-N` names that `fetch_evidence_file` rejects.
  - Boot log now names the LLM endpoint + model.

- [#28](https://github.com/xeroc/accord/pull/28) [`f06c7ab`](https://github.com/xeroc/accord/commit/f06c7ab75ef5ff48986897f3583d46a8b5b2b85f) Thanks [@xeroc](https://github.com/xeroc)! - Docker images (bean accord-a8a9):

  - New `apps/jurat/Dockerfile` — jurat juror-daemon image (same workspace pnpm
    - `pnpm deploy` + bun-runtime pattern as the cranker), built and pushed by
      the Release workflow as `ghcr.io/xeroc/useaccord-jurat`.
  - Cranker/evidence-daemon Dockerfiles: copy EVERY lockfile importer's
    manifest again — `packages/ui`, `apps/{canon,synod,hanse,pitch,remotion,jurat}`
    were missing, so `pnpm install --frozen-lockfile` failed at the deps stage.
  - `.dockerignore`: jurat added to the root-context builds; manifest-only
    members' sources excluded from the context.

- [#27](https://github.com/xeroc/accord/pull/27) [`01fa77c`](https://github.com/xeroc/accord/commit/01fa77cba2d50b3b4edf9087c40515949a7d3e29) Thanks [@xeroc](https://github.com/xeroc)! - Fix solo-panel duties never surfacing: `reconcile` now treats `DisputeState.Drawn` as actionable — on chain, `Drawn` IS the review phase (panel full, windows open; nothing ever writes `Review`, and the first panel `commit` flips `Drawn→Commit`). With a multi-juror panel another juror's commit eventually made the dispute visible; with a solo panel (`min_jury_size: 1`) nobody commits first, jurat idled through the commit window, and the dispute stalled into shortfall redraws. `runDuty` already holds through review and commits at window open, so the fix is the actionable-state set alone (bean accord-zhnh).

- [#27](https://github.com/xeroc/accord/pull/27) [`41da6ad`](https://github.com/xeroc/accord/commit/41da6aded4f0cae24e6d8de68b1bab4fdd788302) Thanks [@xeroc](https://github.com/xeroc)! - Re-anchor round windows at the last state change (ADR-0038, bean accord-9952)

  - `commit` (panel-full) re-anchors `Round.reveal_end` shrink-only to
    `now + reveal_window` — revealers get the full reveal window from the LAST
    commitment, not from the scheduled `commit_end`.
  - `finalize_round` (early resolve, all revealed) pins `reveal_end = now` —
    the appeal window opens at resolution. The timeout path never extends it.
  - Every deadline consumer (`appeal`, `finalize_dispute`, `cancel_dispute`)
    anchors at the re-anchored `reveal_end`, so an eager panel reaches `Final`
    at `resolve_ts + appeal_window` instead of idling out the scheduled
    commit+reveal span (devnet repro: Inveigo arena court, 1s/12h/12h/30s,
    ~24h → ~40s). No account-layout, IDL, or SDK-signature change.
  - e2e harness: new shared `warpToRevealWindow` (draw-harness + appeal.spec
    local) replaces the `warpTo(commitEnd)` reveal warps; jurat duty tracker
    header documents the live-field requirement + a phase test pins it.

- Updated dependencies [[`e6eaa63`](https://github.com/xeroc/accord/commit/e6eaa632eb273735d12b0896963a62550ac98872), [`190145b`](https://github.com/xeroc/accord/commit/190145b334e91295be7a8dc174f79758adb9ec1a), [`41da6ad`](https://github.com/xeroc/accord/commit/41da6aded4f0cae24e6d8de68b1bab4fdd788302)]:
  - @useaccord/sdk@0.8.0

## 0.7.0

### Minor Changes

- [#24](https://github.com/xeroc/accord/pull/24) [`b1fe6b7`](https://github.com/xeroc/accord/commit/b1fe6b7ca25427d6c93a3b5ede344acdaf8cadd2) Thanks [@xeroc](https://github.com/xeroc)! - Add `@useaccord/jurat` (agentic juror daemon, v1 in progress): Telegram notify channel — verdict + alert messages with a never-reject contract so send failures can't crash the duty pipeline (bean accord-4qyb).

### Patch Changes

- [#24](https://github.com/xeroc/accord/pull/24) [`b13c587`](https://github.com/xeroc/accord/commit/b13c587ed0bce8490d0792d25a1ee4d0df669549) Thanks [@xeroc](https://github.com/xeroc)! - jurat: compose the daemon runtime in `src/main.ts` (bean accord-vruh) — the v1 pipeline modules existed and were unit-tested, but the entry point never mounted them, so `pnpm dev` booted and idled. New: `src/runtime.ts` (scan handler: join gates → executor with logged decisions; duty state machine: track → evidence → verdict → commit → reveal with the SPEC failure policy), file-backed duty/vote stores (`src/state/stores.ts`), WS hint layer kicking off-cycle scans, and the config knobs to drive it (`JURAT_SCAN_INTERVAL_MS`, `JURAT_MIN_SOL_LAMPORTS`, optional `JURAT_EVIDENCE_URL` + `JURAT_DELIVERY_KEY_PATH` — the delivery key is generated on first boot). SPEC/README/.env.example updated to match. The lockstep bump for the rest of the workspace comes from the `fixed` group in `.changeset/config.json` at version time — not from this frontmatter.

  Follow-up (bean accord-fwl7): joins stake exactly the pool's own `min_stake` — there is no `JURAT_STAKE_AMOUNT` (a single configured amount cannot be unit-correct across pools with different staking mints; upstaking stays a manual operator action). Budget arithmetic (`JURAT_STAKE_BUDGET` / cap / reserve / book sums) is now per staking token, and zero-minimum pools are rejected at the gates.

- [#24](https://github.com/xeroc/accord/pull/24) [`6303d7b`](https://github.com/xeroc/accord/commit/6303d7b440ff60f076e54c7d6566b229c8c2f60c) Thanks [@xeroc](https://github.com/xeroc)! - Jurat Surfpool e2e: `tests/src/jurat.spec.ts` drives the full agentic-juror duty loop green (reconcile scan → join gates → auto-join → dispute → VRF draw → mock-LLM verdict through the real provider ladder + runner → commit → reveal, with `Round.reveals` and the verdict notice asserted, dryRun OFF) plus the failing-LLM twin (retry ladder exhausted → clean abstain + alert, no vote). Joining the suite required a `loadBook` robustness fix: the first-run ENOENT path now duck-types `code` instead of `instanceof Error`, which breaks on cross-realm errors (jest ESM vm contexts, workers).

- [#24](https://github.com/xeroc/accord/pull/24) [`bcb8c8e`](https://github.com/xeroc/accord/commit/bcb8c8eee90069ca57fc4cf90a49182eb0c98694) Thanks [@xeroc](https://github.com/xeroc)! - feat(jurat): duty pipeline — commit path, failure path, duty tracker, agent toolset, verdict runner, provider ladder, reveal path, evidence intake

  - Commit path (`src/vote/commit.ts`): 32-byte salt generation with persist-before-send, SDK `commitHash`+`commit` wiring gated to the on-chain commit window `[review_end, commit_end)`, and a `DRY_RUN` gate that logs + notifies instead of sending a transaction (bean accord-0ytn).
  - Failure path (`src/duty/failures.ts` + `src/duty/types.ts`): every failure source maps to a persisted abstention + Telegram alert; the module structurally cannot cast a vote (bean accord-5mpb).
  - Duty tracker (`src/duty/tracker.ts`): decoded `Round` → `DutyRecord` for our seat (`Round.jurors[0..juror_count)`), chain-clock window math mirroring the commit.rs/reveal.rs gates (incl. early reveal on full panel), ADR-0021 redraw supersession (same round_idx, attempt+1 → fresh duty or `redrawn-out` closure), idempotent reconcile rescan (bean accord-fgxw).
  - Agent toolset (`src/agent/tools.ts`): four Zod-typed read-only tools (read_dispute, read_subaccord, fetch_evidence_file, read_domain_doc) over injected seams, MCP servers from config via `@ai-sdk/mcp` `createMCPClient`, merged behind the builtin set (builtin wins on collision); no key/shell/fs-write surface exists (bean accord-gww8).
  - Verdict runner (`src/agent/runner.ts`): `runVerdict(AgentContext) → Verdict` via `generateText({ tools, stopWhen: stepCountIs })` + `Output.object` structured output; `VerdictRunner` interface as the container seam; malformed, schema-invalid, or out-of-bounds verdicts throw `MalformedVerdictError` (pipeline abstains, never repairs) (bean accord-o2dc).
  - Provider ladder (`src/agent/provider.ts`): `createOpenAICompatible` primary+fallback endpoints with in-place exponential-backoff retries (`maxRetries: 0` on the SDK — the ladder owns retries), `RetryLadderExhaustedError` when both burn out; malformed verdicts short-circuit the ladder instead of re-rolling (bean accord-ot16).
  - Reveal path (`src/vote/reveal.ts`): reveal at window open (incl. the reveal.rs all-committed early open) with the exact persisted salt+vote, DRY_RUN gate, idempotent; salt loss alerts and throws `SaltLostError` — a wrong guess is a guaranteed on-chain RevealMismatch, so none is ever tried (bean accord-qk0q).
  - Evidence intake (`src/duty/evidence.ts`): ADR-0034 delivery-key handling (file-backed generate-once storage + daemon registration self-heal), juror-bound bundle fetch → decrypt → documents, optional domain-doc fetch (ADR-0027 CAS), and `assembleDutyContext` wiring the read-only tools over the decrypted bundle; unavailable/malformed bundles alert + throw — a partial context is never assembled (bean accord-z801).

- Updated dependencies [[`71dafcb`](https://github.com/xeroc/accord/commit/71dafcb4f42fba11cb5629226baee99f3ea43fdd), [`1e4ad2e`](https://github.com/xeroc/accord/commit/1e4ad2ee4c7b08516392d84100bc9317c8728b79)]:
  - @useaccord/sdk@0.7.0
