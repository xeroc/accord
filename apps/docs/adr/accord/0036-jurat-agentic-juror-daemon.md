# Jurat — agentic juror daemon: full-auto pipeline behind DRY_RUN, evidence-fed agent, conservative join gates

Accord's Schelling-point arbitration needs Jurors at the keyboard when a seat
is drawn — but a drawn seat is a random event and honest participation is the
product. **Jurat** (`apps/jurat`, binary `jurat`) is an autonomous Solana juror
operator: one daemon, one hot operator keypair. It stakes into Subaccords that
pass a conservative filter, watches for its own seats, runs an LLM agent over
the decrypted evidence bundle, and votes commit/reveal on-chain. The Schelling
signal only works if votes are honest *and timely*; Jurat's whole design bends
toward "never cast a garbage vote" — abstain rather than pollute the point.

The name: a **jurat** is a sworn officer who judges (Channel-Islands royal-court
jurors are called jurats to this day); the etymological root of "juror". Same
register as Canon / Synod / Hanse.

Decision set grilled 2026-10-15 (milestone `accord-g69g`). Status of each
decision: **locked for v1**. This ADR is repo-only (like all Accord ADRs);
`apps/jurat/SPEC.md` is the implementation reference.

## Considered Options

- **Scope — full auto-vote pipeline behind `DRY_RUN` (chosen, default ON) vs
  notify-only v1 vs manual-confirm-per-dispute.** Notify-only defers every
  hard problem (verdict plumbing, vote timing, salt persistence) to a v2 that
  would re-litigate the same design under production pressure;
  manual-confirm keeps a human as the availability bottleneck the daemon
  exists to remove. Building the whole pipeline day one but gating the
  vote-shaped transactions behind `JURAT_DRY_RUN` (default on) makes the
  flip to autonomy a config change, observed first as dry-run Telegram
  verdicts. → full pipeline, dry-run default ON; no vote-shaped tx leaves
  the process unless the gate is off.

- **Agent context — evidence pipeline + domain doc, no web tools (chosen) vs
  web/search-augmented agent.** Dispute evidence is attacker-controlled text;
  adding browser/search tools hands the prompt-injection channel live
  outbound capability (fetch URLs planted in evidence). The evidence
  pipeline already delivers exactly the material a juror needs (decrypted
  bundle via registered Delivery Key, ADR-0034), and the Subaccord domain
  doc (ADR-0027) supplies pool-specific context. Worst case stays bounded to
  a bad vote. → fixed read-only context; web tools are a v2+ question, and
  only with the container runtime.

- **Join gates — full conservative set, all config-driven (chosen) vs
  stake-anywhere.** An autonomous staker with no filter parks collateral in
  pools with hostile economics (fee token it cannot earn, Median aggregation
  it cannot vote, commit windows shorter than agent runtime). The gate set:
  `staking_token` AND `fee_token` on allowlist; `min_stake` and
  `fee_per_juror` within configured ranges; `alpha_bps` ≤ cap;
  `aggregation == Plurality` (Median/scalar deferred to v2); `commit_window`
  ≥ floor (agent runtime budget); global stake budget + per-Subaccord cap +
  reserve floor (never stake below a configured remaining balance). All
  knobs in config so conservatism is a policy, not a recompile. → full set.

- **Monitoring — WS log subscription as hints + boot/periodic reconcile as
  truth (chosen) vs event-stream-only.** A pure event subscriber is
  restart-fragile (missed logs while down ⇒ missed duties ⇒ slash risk) and
  Surfnet/devnets drop streams freely. The evidence-daemon pattern
  (`chain/events.ts`) already proved the shape: subscribe to program logs
  (`SubaccordCreated`, `SeatDrawn`, `Redrawn`, `DisputeCreated`) as hints,
  treat accounts as authoritative (`Subaccord` via `getProgramAccounts`,
  `Round.jurors[]` for duty membership), and run a reconcile scan at boot +
  periodically. Restart-safe by construction. → hints + reconcile.

- **Isolation — in-process tool allowlist with a Docker seam (chosen) vs
  containerized agent from day one.** Containers buy kernel-level isolation
  but cost an image pipeline, a runtime dependency, and CI surface before
  the first vote is even cast. In-process, the agent gets a fixed read-only
  toolset (read chain, fetch evidence, read domain doc) + structured verdict
  output; the on-chain vote is built by daemon code from the verdict schema
  — the agent never touches keys, shell, or arbitrary IO. The
  `runVerdict(inputs) → Verdict` seam keeps a container backend a drop-in
  later. Threat model: prompt injection bounds at "a bad vote", and DRY_RUN
  holds until proven. → in-process allowlist, Docker later at the seam.

- **AI library — Vercel AI SDK stack (chosen) vs hand-rolled HTTP client vs
  agent framework.** The requirement is a pluggable provider (any
  openai-compatible endpoint), custom tools with schema-checked outputs, and
  MCP client support for later tool servers. `ai` +
  `@ai-sdk/openai-compatible` (`createOpenAICompatible({ baseURL, apiKey })`)
  covers the pluggability; `tool()` + Zod cover the verdict schema;
  `@ai-sdk/mcp@2` stable `createMCPClient` covers MCP; the agent loop is
  `generateText({ tools, stopWhen: stepCountIs(n) })`. Hand-rolling the loop
  re-solves streaming/tool-calling/retries badly; heavier frameworks import
  opinions we don't need. Retry ladder: primary endpoint → fallback endpoint
  → abstain. → AI SDK.

- **Vote timing — ASAP (chosen) vs strategic delay.** Commit as soon as a
  valid verdict exists (within the commit window); reveal at reveal-window
  open. Sitting on a commit to vote "late and informed" maximizes
  MEV-for-timelock risk, adds state, and buys nothing under commit-reveal
  (the commit already hides the vote). Never sit on a secret: salt is a
  random 32 B per dispute, persisted in local state until reveal.
  `commitHash`/`commit`/`reveal` come from `@useaccord/sdk`. Plurality
  option-index votes only (join gate 3 excludes Median pools). → ASAP.

- **Failure policy — retry ladder → clean abstain (chosen) vs default vote.**
  A garbage or default vote is worse than no vote: it's a fake Schelling
  signal that can swing coherence payouts and corrupt rulings. Abstention
  risk is accepted (missed fee, incoherence cost if drawn), a Telegram alert
  fires, and no vote leaves the process. → abstain, never default.

- **Identity & funds — single operator key, manual top-up (chosen) vs
  multi-persona fleet vs auto-swap treasury.** Multiple juror personas from
  one operator is a Sybil smell the protocol's stake-weighting is designed
  to price, and a violation of the one-juror-one-voice spirit Jurat itself
  depends on. Auto token acquisition (swap staking tokens) is a hot-wallet
  DEX integration — attack surface wildly out of proportion to v1. One
  keypair per instance (path in env), SOL + allowlisted staking tokens
  topped up manually, reserve-floor gate in the join evaluator. → single
  key, manual funds.

## Consequences

- **Jurat is a first-class consumer of the evidence delivery path**
  (ADR-0031/0034): it registers an X25519 Delivery Key at the evidence
  daemon and receives decrypted evidence bundles for disputes it is drawn
  into. No new daemon surface; juror-side key custody is Jurat's own (a
  file-backed key, not a browser IndexedDB one).
- **The notify channel is load-bearing, not cosmetic.** Verdict messages and
  alerts fire DRY_RUN-independent; a send failure never crashes or stalls
  the duty pipeline (never-reject contract — landed with the channel,
  `src/notify/`).
- **Local state dir is a real protocol artifact**: duties, per-dispute salts
  (until reveal), event cursor, joined-Subaccord book. Loss of state ⇒
  unrevealable commits (salts gone) — the state dir is backed up like a
  hot wallet's memory, and reconcile-at-boot makes it reconstructable
  except for salts of in-flight commits.
- **Median/scalar pools are invisible to v1 Jurat** (join gate); v2 extends
  the verdict schema to scalar votes and drops the aggregation gate.
- **Agent quality is a juror-quality problem.** A systematically wrong agent
  voting coherently-with-itself across pools is a minority bloc that gets
  slashed by the coherence rule — the protocol's own economics bound the
  damage of a bad agent, which is what makes autonomy acceptable at all.
- **DRY_RUN flipping is an operational event**: verdicts observed as dry-run
  Telegram messages first, then the flag flips per instance after the
  operator is satisfied. No code change, no redeploy.
- **Non-goals (v1):** Median/scalar pools, web tools, Docker runtime, auto
  token acquisition, multiple juror personas, domain-doc parsing as a join
  gate (v2 candidate), auto-unstake/exit policy.

## References

- Milestone `accord-g69g` (grill 2026-10-15 — this decision set)
- ADR-0011 (evidence operator daemon), ADR-0015 (evidence crypto in SDK),
  ADR-0027 (domain-doc CAS), ADR-0031 (per-file transport),
  ADR-0034 (Delivery Keys — Jurat's evidence intake)
- `apps/jurat/SPEC.md` (implementation reference), `apps/jurat/README.md`
- `CONTEXT.md` — Juror, Dispute, Round, Subaccord
