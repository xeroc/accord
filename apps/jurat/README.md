# Jurat — Agentic Juror Daemon

**Jurat** (`@useaccord/jurat`) is the autonomous juror operator for the
[Accord](https://useaccord.xyz) arbitration protocol: one daemon, one hot
operator keypair. It stakes into Subaccords that pass a conservative
config-driven filter, watches for its own seats being drawn, runs an LLM
agent over the decrypted evidence bundle, and votes commit/reveal — gated
behind `JURAT_DRY_RUN` (default **on**: no vote-shaped transaction leaves the
process until you flip it). Every verdict and alert goes to Telegram
regardless of the gate.

Authority: [ADR-0036](../docs/adr/accord/0036-jurat-agentic-juror-daemon.md)
(decisions) · [`SPEC.md`](./SPEC.md) (architecture, gates, duty flow, config).

> [!NOTE]
> **Status: v1 landed (milestone accord-g69g + daemon runtime accord-vruh).**
> The full loop — scan → join gates → duty tracking → verdict → commit/reveal —
> runs from `src/main.ts`; see `SPEC.md` for the module map.

## Quickstart

```sh
# from the repo root
pnpm install
cd apps/jurat

pnpm test    # bun test — unit tests (notify channel today)
pnpm build   # tsc --noEmit
pnpm lint    # eslint

# run the daemon (boots a scan immediately, then every JURAT_SCAN_INTERVAL_MS)
JURAT_RPC_URL=... JURAT_KEYPAIR_PATH=... JURAT_DRY_RUN=true bun run src/main.ts
```

Configuration is env-driven (`JURAT_*`, see the [config
table](./SPEC.md#config-surface-env--typed-config) in the SPEC). Top up the
operator key with SOL and allowlisted staking tokens manually — there is no
auto-acquisition by design.

## Safety rails

- `JURAT_DRY_RUN=true` (default): verdicts are computed and reported, votes
  are not cast.
- Failure policy is **clean abstain** — retry ladder then abstain + alert;
  never a default vote.
- The agent never touches keys, shell, or arbitrary IO; votes are built by
  daemon code from a schema-checked verdict.

## Arming (live voting)

The daemon ships **disarmed**: `JURAT_DRY_RUN=true` (default) computes and
reports verdicts but never sends a vote-shaped transaction. To arm it:

```sh
JURAT_DRY_RUN=false
```

Arming only produces votes when the rest of the pipeline is live:

- **Evidence intake** — `JURAT_EVIDENCE_URL` + `JURAT_DELIVERY_KEY_PATH` must
  both be set; without them duties hold forever (verdicts need the decrypted
  bundle + domain doc).
- **LLM** — `JURAT_LLM_BASE_URL` / `JURAT_LLM_API_KEY` / `JURAT_LLM_MODEL`
  (plus the optional fallback triple).
- **Stake + SOL** — the operator key must hold allowlisted staking tokens and
  SOL; the join executor stakes the pool minimum per accepted Subaccord.

A dry-run verdict held before arming is **re-committed with the same salt and
vote** on the next scan after `JURAT_DRY_RUN=false` — flipping the gate does
not re-roll the verdict. The armed loop (scan → verdict → commit → reveal,
daemon-driven) is proven by `tests/src/jurat.spec.ts` against Surfpool with
`dryRun` off.

## Further reading

- `apps/jurat/SPEC.md` — build specification
- `apps/docs/adr/accord/0036-jurat-agentic-juror-daemon.md` — decision record
- `CONTEXT.md` (repo root) — Accord domain language
