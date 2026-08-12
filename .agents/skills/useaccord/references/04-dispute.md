# Dispute — Arbitrable Intake & Lifecycle Escape

The `dispute:*` commands are the Arbitrable's entry point into Accord. Any
program (or wallet) **files** a Dispute, then lazily **reads** the ruling once
it reaches `Final`. Two pure helpers support fee pre-checks; one crank provides
a liveness escape when a round stalls.

## Commands

### `dispute:create` — file a Dispute

The **Arbitrable CPI entry** (`create_dispute`, lib.rs:768). The filer pays the
full round-1 fee up front into the Subaccord's shared `fee_vault`; the on-chain
fee is authoritative. Initializes the Dispute PDA `["dispute", filer, nonce]`,
sets `state = Created`, `final_ruling = u8::MAX`, and **freezes** the Subaccord's
economics (`CaseTerms`) at filing time so a 48h parameter update can't shift
slashing/fees/windows mid-dispute.

```bash
# Two option label hashes (each 32B), auto-compute the fee from the Subaccord
useaccord dispute:create \
  --subaccord cordh…yKed \
  --options 0xdeadbeef…32bytes,0xcafebabe…32bytes \
  --nonce random \
  --fee auto
# → { signature, dispute: "RokL…HEef", bump: 254 }

# Explicit fee (must equal 3 × subaccord.fee_per_juror exactly)
useaccord dispute:create --subaccord cordh… --options $A,$B --nonce 7 --fee 300_000
```

Flags (mirror `CreateDisputeArgs`, dispute.ts:46):

- `--options <hex,hex,…>` — 2..32 option label hashes, each 32 bytes
  (`2..=MAX_OPTIONS`, lib.rs:778).
- `--nonce <u64|random>` — filer-chosen; gives a private dispute namespace.
- `--fee <lamports|auto>` — `auto` ⇒ `requiredFee` from the Subaccord's
  `fee_per_juror`. On-chain `fee == required_fee` is enforced exactly
  (`FeeMismatch`, lib.rs:784).

**Reverts while paused** (ADR-0007) and if `staker_count < min_jury_size`
(default 3, accord-9q3e). SDK: `createDispute` (dispute.ts:203); validation:
`assertValidOptions`, `assertValidEvidenceHash`, `assertValidNonce`.

### `dispute:required-fee` — pure pre-check

Compute the round-1 filing fee with no chain access. The panel is the
Subaccord's `min_jury_size` (default 3, accord-9q3e), so the fee is
`min_jury_size · fee_per_juror`. Matches
`dispute:create --fee auto`; use it to budget before filing.

```bash
useaccord dispute:required-fee --fee-per-juror 100_000
# → { fee: 300000 }   # 3 × 100_000 (default min-jury-size=3)

useaccord dispute:required-fee --fee-per-juror 100_000 --min-jury-size 1
# → { fee: 100000 }   # N=1 pool (Arena/Inveigo config)

useaccord dispute:required-fee --fee-per-juror 0
# → { fee: 0 }          # a Subaccord with no juror compensation
```

Pure — no signer, no send. Returns `null` on u64 overflow rather than throwing.
SDK: `requiredFee(feePerJuror)` (dispute.ts:113).

### `dispute:ruling` — read-only outcome read

Lazily read a dispute's final ruling. Returns `null` until the dispute reaches
`Final`; afterwards, the winning option index (`0..num_options`). Mirrors the
on-chain `get_ruling` CPI entry (lib.rs:2063), which stores the unfinalized
value as the `u8::MAX` sentinel. Arbitrables call this via CPI to read the
verdict; the CLI exposes it for monitoring/scripts.

```bash
useaccord dispute:ruling --dispute RokL…HEef
# mid-lifecycle → { finalRuling: null }
# after Final   → { finalRuling: 1 }
```

Read-only. SDK: `getRuling(dispute)` (dispute.ts:232).

### `dispute:cancel` — permissionless liveness escape

`cancel_dispute` (lib.rs:1802) refunds the filer and transitions the dispute to
terminal `Failed` when a round stalls past its timeout. Two branches:

- **Pre-draw stall** (`Created`, no panel drawn): cancelable after
  `filed_at + PRE_DRAW_CANCEL_TIMEOUT_SECS` (3 days).
- **Post-draw stall** (`Drawn`/`Commit`/`Reveal`/`RoundResolved`): cancelable
  after `round.reveal_end + appeal_window + POST_DRAW_CANCEL_GRACE_SECS` (3 days
  grace beyond the appeal window).

Releases `active_draws` (and slash reserves) for every drawn juror across the
current and prior rounds, then refunds the filer. **Cranker automates this** on
timeout; the CLI is the manual fallback.

```bash
# Auto-derives the Round / JurorStake / AppealBond PDAs to release
useaccord dispute:cancel --dispute RokL…HEef --remaining-accounts auto
# → { signature, refund: 300000 }

# Manual account list (advanced / offline)
useaccord dispute:cancel --dispute RokL…HEef \
  --remaining-accounts RoundPDA,Stake1,Stake2,Stake3,Bond0
```

`Final`/`Closed`/`Failed` are terminal and revert (`InvalidState`).
SDK: `cancelDispute` (settlement.ts:89).

> **C-1 fix (Critical):** the refund is exactly `dispute.fee_paid` (the
> per-dispute fee pool) — **not** the shared `fee_vault` balance. The
> `fee_vault` is one ATA for the *entire* Subaccord; the old code refunded
> `vault_balance − reserved`, which drained every other active dispute's
> deposited fees (and, when `staking_token == fee_token`, juror collateral).
> Now capped at `dispute.fee_paid` (lib.rs:2024), matching the `redraw` Fail
> branch. Appeal bonds are not swept here — they stay claimable via
> `claim_appeal_refund`.

## Dispute lifecycle state machine

On-chain `DisputeState` (state.rs:362). Permissionless cranks advance each state
when its window elapses.

```
Created ──panel fills──► Drawn ──first commit──► Commit ──first reveal──► Reveal
   │                       │                        │                        │
   │                       │ (review window:         │                        │
   │                       │  commits gated on       │                        │
   │                       │  round.review_end)      │                        │
   │                                                                       │
   └─────────── cancel/timeout ──────────────► Failed ◄────────── finalize_round
                                                              (shortfall) │
                                                                          │
                          Reveal ──finalize_round──► RoundResolved         │
                                                      │      │              │
                                              appeal │      │ no appeal    │ redraw
                                   ┌─────────────────┘      │ (window      │ exhaustion
                                   ▼                        │  elapses)    │
                              back to Created         finalize_dispute     │
                                                          │                │
                                                          ▼                │
                                                        Final ◄────────────┘
```

- `Created` — filed; awaiting VRF + panel draw. (`appeal` and `redraw`
  reconvene back here for a fresh round.)
- `Drawn` — panel complete; round windows set. The **review** sub-window
  (`now < review_end`) precedes commit; commits are rejected until it elapses.
- `Commit` — first commit lands (`now ≥ review_end`); `hash(vote, salt)`.
- `Reveal` — first reveal lands (`now ≥ commit_end`); `{vote, salt}`.
- `RoundResolved` — `finalize_round` tallied the round; awaiting the appeal
  window. (Shortfall instead lands `RedrawEligible`.)
- `Final` — `finalize_dispute` wrote `final_ruling`; `getRuling` now returns it.

Branch/terminal states: `RedrawEligible` (quorum shortfall → `redraw`),
`Failed` (cancel / redraw exhaustion), `Closed` (fully settled).

## SDK functions

| CLI command | SDK fn | Source |
|---|---|---|
| `dispute:create` | `createDispute` | dispute.ts:203 |
| `dispute:ruling` | `getRuling` | dispute.ts:232 |
| `dispute:required-fee` | `requiredFee` | dispute.ts:113 |
| `dispute:cancel` | `cancelDispute` | settlement.ts:89 |
| (validation) | `assertValidOptions` | dispute.ts:124 |
| (PDA) | `findDisputePda` | dispute.ts:178 |
