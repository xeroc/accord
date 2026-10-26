# Jury telemetry — jurat traces pushed to the evidence daemon, public WS watch, sealed verdicts, durable replay

Accord disputes are judged by agentic jurors (Jurat, ADR-0036) whose reasoning
is invisible: an observer sees a commit tx and, after reveal, a vote — never
*how* the agent got there. That hidden process is both a product surface
("watch the jury think" — a website following a dispute in real time) and a
compounding asset (a corpus of reasoning traces tied to real economic outcomes:
coherent/incoherent payouts per ADR-0029, fees won/lost). This ADR adds a
telemetry path: **Jurat pushes signed agent-trace batches to the Evidence
Operator daemon; websites subscribe per-dispute over WebSocket; every batch is
durable on the store seam for replay.**

The Evidence daemon is the fan-out point because it is the neutral meeting
ground — every drawn juror of a Subaccord already pulls evidence from it
(ADR-0034), it holds the public TLS surface (ADR-0011), the live `Round.jurors[]`
gate, and the pluggable store. Jurat never becomes publicly reachable; one WS
connection per dispute sees *all* drawn jurors' agents working.

Decision set grilled 2026-10-23. Off-chain only — no program change, no qedspec
delta.

## Considered Options

- **Transport jurat → daemon: signed HTTPS POST batches (chosen) vs message
  broker (Redis/NATS/Kafka) vs jurat-held WebSocket.** Volume is trivial — one
  duty ≈ 8–16 steps of a few hundred bytes each, produced over minutes (chain-
  clock windows, not milliseconds). A broker buys replay/outbox machinery for a
  firehose of KBs/min and adds a second system that can be down next to the
  daemon; a jurat-held WS buys nothing over POST (steps are seconds apart) and
  costs reconnect/keepalive state. The path already exists (evidence intake) —
  same TLS, same rate limiter. The failure contract maps 1:1 onto the
  `NotifyChannel` pattern (ADR-0036 decision 8): bounded queue, drop-oldest,
  short timeout, **tracing must never stall or crash the vote pipeline**. →
  `POST /trace/...` with `{v, seq, events[], sig}`, Ed25519-signed by the juror
  hot key (the same key that commits) over a canonical batch hash; the daemon
  gates on live `Round.jurors[]` membership exactly like delivery. A broker
  re-enters only if multi-replica fan-out ever becomes real — and then only
  behind the fan-out layer; the push leg stays POST.

- **Verdict visibility: sealed until the reveal window (chosen) vs live-open
  feed.** Streaming verdict + rationale before commit/reveal breaks vote
  independence: lazy jurors free-ride Jurat's reasoning, and herding pays —
  which erodes the independent-signal aggregation the Schelling point runs on.
  The investigation itself (which tools, which files, how long, token usage) is
  not vote-revealing. → steps stream live; the `verdict` frame is a **sealed
  envelope** carrying `unsealAt = round.revealEnd` (or released immediately by
  the producer in `JURAT_TRACE_MODE=open` demo deployments). The daemon holds
  sealed frames back at read time — live fan-out, WS catch-up, and REST replay
  all filter against *current* time, so a replay served mid-window still hides
  the conclusion and a later replay passes it straight through.

- **Trace content: tool metadata + digests (chosen) vs full evidence/step
  text.** Evidence plaintext is juror-bound by construction (ADR-0006/0034);
  routing it into a public watch feed would undo the entire delivery-crypto
  stack. Intermediate model text can quote evidence — same leak, softer
  justification. → tool calls carry `{name, args (builtin four only),
  resultDigest, bytes, ms}` + token usage; MCP tool args are digest-only
  (untrusted surface); rationale ships only inside the sealed envelope. "How" =
  the tool sequence; "why" = the post-unseal rationale.

- **Push authenticity: juror-hot-key signature + live draw gate (chosen) vs
  Delivery Key vs unauthenticated.** The feed is public and narrative-shaping:
  an unauthenticated push lets anyone fabricate an agent's "reasoning";
  Delivery Keys are open-registration (ADR-0034) and prove nothing about the
  drawn set. → each batch is Ed25519-signed by the juror keypair (the wallet
  identity already committed with), verified against the on-chain address, and
  gated on live `Round.jurors[]` membership. No new registry.

- **Persistence: durable append-only, keep forever (chosen) vs ring-buffer-only
  vs prune-post-finality.** The corpus is the asset — fine-tuning data for
  better juror models, appeals evidence, audit material. A duty's full trace is
  ~10–50 KB of text; storage cost is noise. → every verified batch is written
  through to the store seam before fan-out: fs backend appends JSONL
  (`traces/{subaccord}/{dispute}/{juror}.jsonl`), S3 backend puts one immutable
  object per batch (`traces/{sub}/{dispute}/{juror}/{seq}.json`) — no
  read-modify-write, puts atomic, idempotent on seq. Envelopes are
  schema-versioned (`v: 1`) and never mutated; corrections are new events.

- **Fan-out state: single-replica in-memory (chosen) vs cross-replica pub/sub.**
  The daemon's stateless-replica posture (ADR-0011 §HA) covers the request/
  response surface; live WS fan-out is inherently connection-stateful. → v1 is
  single-replica fan-out (in-memory ring buffer + subscriber sets) with durable
  replay for everything else; `GET /trace/:dispute` serves catch-up from the
  store on any replica. Sticky routing or pub/sub is a drop-in behind the
  fan-out map if replicas ever need it.

- **Retention sweep: none (chosen) vs RulingFinalized-triggered prune.** Traces
  are operator telemetry, not evidence; the encrypted-at-rest invariant binds
  evidence objects only (ADR-0027 scope logic). Keep; revisit only if a
  Subaccord authority asks for deletion.

## Consequences

- The evidence daemon gains three public surfaces (amends ADR-0011 §HTTP API):
  `POST /trace/:subaccord/:dispute/:juror` (authenticated append),
  `GET /watch/:dispute` (WebSocket: replay-then-live, seal-filtered), and
  `GET /trace/:dispute[?fromSeq=]` (polling/replay fallback) — plus a `traces/`
  storage namespace on the existing pluggable seam and `TRACE_*` config.
- Jurat gains a `TraceSink` beside `NotifyChannel` with the same never-reject
  contract, an `onStepFinish` tap inside the `VerdictRunner` seam (container
  backends inherit it via `AgentContext`), and `JURAT_TRACE_URL` /
  `JURAT_TRACE_MODE` config. Unset URL = tracing fully off.
- Vote independence is preserved mechanically, not by policy: the sealing
  predicate lives in the daemon read path, so no client — live, reconnecting,
  or replaying — can see a verdict before the chain reveals it (outside
  explicit demo mode).
- Trace loss is always acceptable: dropped batches leave visible seq gaps in a
  monitoring feed; the durable record is what actually arrived. The duty
  pipeline is never blocked, retried, or failed on trace errors.
- The trace schema (`v: 1` envelope + event union) becomes a wire contract
  shared by jurat, daemon, and any future consumer (analytics, fine-tuning
  extractors) — changes are additive from here on.
- No on-chain change: instruction set, accounts, and events untouched; no
  `.qedspec` delta. Changeset (lockstep) ships with the implementation.

References: ADR-0036 (Jurat), ADR-0011 (daemon), ADR-0006/0034 (evidence
confidentiality the redaction rules protect), ADR-0027 (namespace-scope
precedent for plaintext operator data), ADR-0029 (the outcome labels that make
the corpus valuable).
