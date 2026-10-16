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

## Further reading

- `apps/jurat/SPEC.md` — build specification
- `apps/docs/adr/accord/0036-jurat-agentic-juror-daemon.md` — decision record
- `CONTEXT.md` (repo root) — Accord domain language
