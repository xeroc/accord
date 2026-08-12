# Lifecycle — Subaccord Creation + Circuit Breaker

Commands under `useaccord lifecycle` create a Subaccord (specialized juror pool)
and manage its governance timelock + circuit breaker. Each maps 1:1 to an SDK
facade in `methods/lifecycle.ts`.

The `--keypair` wallet is the fee payer AND instruction signer for every
command (single-signer model, ADR-0010). Authority-gated commands require that
wallet to be the on-chain authority.

## `lifecycle:create-subaccord`

Permissionless creation. Seeds `["subaccord", creator, risk_type]` — each
creator owns a private namespace per `risk_type`. `risk_type` and
`evidence_spec` are **immutable** identity hashes; all other params route
through propose/execute.

Flags mirror `CreateSubaccordArgs` (`methods/lifecycle.ts`):

| Flag | Type | Notes |
|---|---|---|
| `--risk-type <hex>` | 32-byte hex | Identity hash; `≠ [0;32]`. Omit with `--random-risk-type` |
| `--random-risk-type` | flag | Mints a fresh 32-byte risk_type ⇒ unique PDA |
| `--evidence-spec <hex>` | 32-byte hex | Immutable evidence-format spec (ADR-0006) |
| `--staking-token <mint>` | address | Collateral mint (L-4: validated as `Account<Mint>`) |
| `--fee-token <mint>` | address | Compensation mint, distinct from staking (ADR-0020) |
| `--min-stake <lamports>` | u64 | Default `1_000` |
| `--alpha-bps <n>` | u16 | Slash factor; `≤ 10_000`; default `1_000` (10%) |
| `--review-window <secs>` | u64 | Default `604_800` (7d) |
| `--commit-window <secs>` | u64 | Default `172_800` (2d) |
| `--reveal-window <secs>` | u64 | Default `172_800` (2d) |
| `--appeal-window <secs>` | u64 | `≥ 3_600` (1h floor); default `259_200` (3d) |
| `--max-appeals <n>` | u8 | `≤ 3`; bounds the appeal ladder depth. `0` ⇒ no appeals |
| `--min-jury-size <n>` | u32 | Round-1 panel size (accord-9q3e). Default `3`; must be odd; ladder `(J+1)·2^maxAppeals − 1 ≤ 31`. Set `1` for a single-juror pool (`--max-appeals 0`) |
| `--aggregation <Plurality>` | enum | v1 = `Plurality` |
| `--fee-per-juror <lamports>` | u64 | Default `0` |
| `--reveal-threshold-bps <n>` | u16 | `≤ 10_000`; default `6_666` (2/3) |
| `--shortfall-policy <Redraw>` | enum | v1 = `Redraw` |
| `--max-draw-attempts <n>` | u8 | `1..=10`; default `3` |
| `--authority <addr\|none>` | address | `none` ⇒ immutable Subaccord |
| `--evidence-operator <addr>` | address | Trusted re-encryption service (ADR-0006) |
| `--juror-credential <addr>` | address | PROG-ATTESTTION SAS attestation issuer; both-or-neither with `--juror-schema`. Omit ⇒ stake-only |
| `--juror-schema <addr>` | address | PROG-ATTESTTION schema the juror's attestation must match; both-or-neither with `--juror-credential` |
| `--depth <n>` | u8 | Accumulator tree depth; `≤ 31`; bounds pool at `2^depth`. Default `16` |

```bash
# Immutable pool, all defaults
useaccord lifecycle:create-subaccord \
  --random-risk-type \
  --evidence-spec 0x$(openssl rand -hex 32) \
  --staking-token Es9vM…z6Xq --fee-token EPjFW…e4U \
  --authority none

# Mutable pool governed by an authority (propose/execute enabled)
useaccord lifecycle:create-subaccord \
  --risk-type 0xabcd…1234 \
  --evidence-spec 0x0000…0001 \
  --staking-token Es9vM…z6Xq --fee-token EPjFW…e4U \
  --min-stake 5_000_000 --alpha-bps 1500 --fee-per-juror 100_000 \
  --authority 9a1K…mQp --depth 16
# Credential-gated pool — jurors must hold a valid SAS attestation to stake/draw
useaccord lifecycle:create-subaccord \
  --random-risk-type \
  --evidence-spec 0x0000…0001 \
  --staking-token Es9vM…z6Xq --fee-token EPjFW…e4U \
  --juror-credential <issuer> --juror-schema <schema>   # both-or-neither
```

SDK: `createSubaccord(client, programId, creator, args)` → `{ instruction, subaccord, bump }`
> **PROG-ATTESTTION:** `--juror-credential` and `--juror-schema` are
> both-or-neither. Omit both to mint a **stake-only** Subaccord (the default —
> today's behaviour). Pass both to gate the juror pool on a SAS attestation;
> jurors must then supply `--attestation` to `staking:stake`, and expired
> attestations are evicted by the permissionless `staking:prune-juror` crank.
> Both fields are frozen at creation (immutable, like `risk_type`).
>
> **L-4 fix:** `--staking-token` and `--fee-token` are passed as account
> addresses (not instruction data). The SDK routes them to the `CreateSubaccord`
> accounts context where they're validated as `Account<Mint>` from
> `anchor_spl::token` — the ownership check rejects Token-2022 mints by
> construction (Token-2022 is owned by a different program ID).

## `lifecycle:propose-update` / `lifecycle:execute-update` (48h timelock)

Authority-gated parameter updates with a timelocked two-phase apply. The
`PendingUpdate` PDA is keyed by `["update", subaccord, nonce]`; the nonce is
caller-chosen and PDA `init` enforces uniqueness.

```bash
# 1. Propose (authority signs) — arms UPDATE_TIMELOCK_SLOTS (432_000 slots ≈ 48h)
useaccord lifecycle:propose-update \
  --subaccord cordh…yKed \
  --nonce 1 \
  --payload MinStake:9999
# → { signature, pendingUpdate: "cordh…", executeAfterSlot: 3_120_000 }

# 2. Wait ≥ 48h. Read back the exact slot:
useaccord read:pending-update <pendingUpdate-addr>

# 3. Execute (permissionless — anyone pays gas) once slot ≥ executeAfterSlot
useaccord lifecycle:execute-update \
  --subaccord cordh…yKed \
  --pending-update <pendingUpdate-addr>
```

Payload kinds (`--payload <Kind:value>`) — `risk_type`/`evidence_spec` are
immutable and absent: `MinStake:<lamports>`, `AlphaBps:<n>`, `ReviewWindow:<secs>`,
`CommitWindow:<secs>`, `RevealWindow:<secs>`, `AppealWindow:<secs>`,
`MaxAppeals:<n>`, `FeePerJuror:<lamports>`, `Authority:<addr>`,
`EvidenceOperator:<addr>`.

SDK: `proposeSubaccordUpdate` → `{ instruction, pendingUpdate }`;
`getUpdateExecuteAfterSlot` reads the slot back; `executeSubaccordUpdate` →
`Instruction`. Gate execution with `canExecuteAt(executeAfterSlot, currentSlot)`.

> **H-1 fix:** `validate_update_payload` runs at **both** phases. Propose rejects
> invalid params early (immediate feedback, no wasted 48h wait); execute
> re-validates as defense-in-depth (e.g. `AlphaBps ≤ 10_000`,
> `AppealWindow ≥ MIN_APPEAL_WINDOW_SECS`, windows `> 0`, `MinStake > 0`).
> The `PendingUpdate` is closed (rent refunded to caller) once applied.

## Circuit breaker (`initialize_pause` / `pause` / `unpause`)

A global `PauseState` singleton (PDA `["pause"]`). While paused, `create_dispute`
reverts with `ProgramPaused` — staking/withdraw still work. Run `init-pause` once
per program deployment; the caller becomes the pause authority.

```bash
# One-time init (idempotent with --skip-if-exists)
useaccord lifecycle:init-pause
useaccord lifecycle:init-pause --skip-if-exists   # exit 0 if already set

# Instant emergency freeze (authority-gated)
useaccord lifecycle:pause --pause-state <addr|auto>

# Arm unpause after UNPAUSE_TIMELOCK_SLOTS (216_000 slots ≈ 24h)
useaccord lifecycle:propose-unpause --pause-state <addr|auto>

# Land the unpause once the 24h notice elapses (permissionless)
useaccord lifecycle:execute-unpause --pause-state <addr|auto>
```

`--pause-state` defaults to `auto` (derives the singleton). A fresh `pause`
cancels any in-flight unpause.

SDK: `initializePause`, `pause`, `proposeUnpause`, `executeUnpause`.

## Cranker automation

The Accord Cranker (`apps/cranker/`, milestone `accord-27r5`) automates the two
permissionless timelock landings, so you normally only run propose:

| Crank | When | Replaces |
|---|---|---|
| `execute_subaccord_update` | `slot ≥ execute_after` | `lifecycle:execute-update` |
| `execute_unpause` | `slot ≥ pending_unpause_after` | `lifecycle:execute-unpause` |

`propose-update`, `propose-unpause`, `pause`, and `create-subaccord` are
authority/signer-gated and run manually via the CLI.

See: ADR-0005 (Subaccord lifecycle), ADR-0007 (circuit breaker),
`programs/accord/src/lib.rs` (`create_subaccord` … `execute_unpause`).
