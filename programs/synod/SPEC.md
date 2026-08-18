# Accord Synod — v1 Build Specification

> **Status:** specified (not yet built). **Authority:** `meta/specs/PROG-MULTI-PARTY.md`
> (design seed — grilling session 2026-08-18, all questions resolved), ADR-0004
> (party-agnostic Accord), ADR-0018 (fees paid at reveal), ADR-0021 (non-decisive
> rounds / redraw), ADR-0025 (ruling is `u64`), bean `accord-n3vw` (tie→redraw,
> hard build dependency), bean `accord-s72c` (parked later-version economics).
> This file is the implementation reference for Synod. Code is authority on
> current state; this spec is authority on intent.

## Overview

`programs/synod` is a generic **N-party dispute escrow** — the second reference
Arbitrable after Canon. Named parties each stake an equal amount `S`; Synod
files ONE single-filer Accord dispute whose options are party-indexed; Accord's
jurors rule; Synod pays the pot to the prevailing party. Accord Core learns
nothing about parties (ADR-0004 unchanged) — all party economics live here.

**Positioning:** reusable primitive + reference Arbitrable, not an app.
Consumers-to-be: `PROG-ESCROW` (milestone disputes) routes through it later.
**Name:** a synod is an assembly convened to settle a contested question and
issue a ruling; synods issue canons — the Canon↔Synod kinship mirrors the two
Arbitrables' actual relationship under Accord. Canonical program ID
`GdV5rbRd579LUs3zB2PkbBsJNCMSj55rwWdikGuobHeC` (keypair in multisig custody,
outside git — same drill as accord/canon).

## The one Accord-Core dependency (hard blocker)

**`accord-n3vw` — Plurality top-count tie → `RedrawEligible`** (exhaustion →
`Failed` + refunds). Without it, `.max_by_key` crowns an arbitrary party out of
a dead heat — structurally reachable even on full odd-panel reveals once ≥3
options exist (5-panel: 2-2-1). Build Synod's e2e suite only after this lands.
Everything else in Accord is frozen.

## Account / PDA model

| Account | Seeds | Key fields |
| --- | --- | --- |
| `SynodCase` | `["case", opener, nonce]` | `subaccord`, `parties: [Pubkey; 7]` (naming order, opener = index 0), `party_count` (2..=7), `joined: u8` bitmask, `stake: u64` (`S`), `fee: u64` (**frozen at open** = `initial_num_jurors · fee_per_juror` from the Subaccord — governance can't shift the deal mid-window), `join_deadline: i64`, `evidence: [[u8; 32]; 7]` (per-party hash, written at join), `dispute: Pubkey` (sentinel until filed), `paid_out: u8` bitmask (per-party idempotency), `state`, `bump` |
| vault | `SynodCase`-PDA ATA | `subaccord.fee_token` — **one mint for stake + fee** (ADR-0020 fee_token; party stake is pot money, never juror collateral) |

Synod **reuses** Accord's `Dispute`, `Round`, `JurorStake`, `Subaccord`. It does
not reimplement voting, the draw, appeals, or juror economics. The case PDA is
the Accord `filer` signer (`invoke_signed`); Accord dispute PDA =
`["dispute", case_pda, 0]` — one dispute per case, nonce 0.

## Open-time validations (`open_case`)

- `2 <= party_count <= 7` (MAX_OPTIONS = 8 → 7 party slots + 1 neutral), parties distinct, opener ∈ roster at index 0.
- `subaccord.aggregation == Plurality` (Median scalars have no option mapping).
- `party_count · stake > fee` (the pot must be positive — `S` is the only economic dial; it prices skin-in-the-game AND absorbs the fee).
- `join_deadline > now`.

## Instructions

| # | Instruction | Semantics |
| --- | --- | --- |
| 1 | `open_case(subaccord, parties, stake, join_deadline, nonce)` | permissionless; validates (above), freezes `fee`, inits `SynodCase`. Opener does NOT stake here — joins via `join` like everyone. |
| 2 | `join(case, evidence_hash)` | `signer == parties[i]` for an unjoined `i`; before deadline, pre-file. Transfers `S` into the vault; records the party's own evidence hash (slot frozen at join — late evidence rides appeal-round slots, ADR-0023, via independent appeal). |
| 3 | `file_dispute(case, opener, nonce)` | permissionless; requires ALL parties joined (early lock — no deadline wait once full). `opener` (unchecked account) + the case-open `nonce` re-derive the case PDA (seeds constraint) and provide the `invoke_signed` seeds — `SynodCase` stores no seed backrefs. Builds options deterministically: `option i = H("synod-opt" ‖ case_pda ‖ i_le64)` for parties, `option party_count = neutral ("no party prevails")` at the **highest index**. `evidence_hash = H(case_pda ‖ evidence[0] ‖ … ‖ evidence[N-1])` — PDA identifies, per-party hashes COMMIT (daemon bundle-swap is detectable). CPIs Accord `create_dispute(options, evidence_hash, fee=frozen, nonce=0)` with the case-PDA as filer signer; fee flows from the vault. State → `Live`, dispute PDA bound (immutable, SPEC §Invariants 2). The four Accord CPI-only accounts (dispute, accord_state, fee_vault, accord_program) ride `remaining_accounts` (canon `challenge_item` shape). |
| 4 | `refund_roster_miss(case, opener, nonce)` | permissionless crank; after `join_deadline` with roster incomplete → refund each JOINED party `S` (idempotent, `paid_out` bitmap); no fee was ever paid. **Per-party pull**: the caller passes the destination party token account (owner identifies the party, mint checked) — a missing ATA for one party never blocks another. State → `Closed` when every joined bit is paid. `opener`+`nonce` re-derive the case PDA (invoke_signed seeds). |
| 5 | `claim(case, dispute, opener, nonce)` | permissionless; reads the Accord dispute state — `Final`/`Failed` only (still resolving → `DisputeNotFinal`). **Per-party pull** (same destination-identifies-the-party shape). `Final`: ruling `i < party_count` → party `i` pulls the pot `N·S − fee`, one-shot (case closes on that payout; non-winner pulls no-op); ruling `== party_count` (neutral) → each party pulls `⌊(N·S − fee)/N⌋`, the LAST claimant drains the remainder (vault empties exactly). `Failed` (Accord `cancel_dispute` has already returned the un-consumed fee to the vault) → each party pulls `S` in full. Per-party `paid_out` bit set on payout (replay no-ops even after `Closed`); case closes when nothing remains due. |

Appeals: **passive, always.** Anyone appeals directly at Accord (ADR-0004);
Synod never funds, matches, or tracks appeals. `claim` keys off the FINAL
ruling whenever it lands. No default judgment, no ex parte — a party who wants
another round appeals like any independent appellant.

## Case state machine

```
open_case ──► OPENING ──(all joined)──────────► LIVE ──(Accord Final: party)──► winner pot ─┐
                 │                                     │                                    ├─► CLOSED
                 └─(deadline, incomplete)── REFUNDING  ├─(Accord Final: neutral)─ refunds  ─┤
                                                ──► Closed                                │
                                                      └─(Accord Failed + cancel)─ full S ──┘
```

## Economics (single mint: `subaccord.fee_token`)

- Each party deposits exactly `S`; at file the fee is deducted from the
  collective escrow and **is gone** (jurors are paid at reveal, ADR-0018 — no
  winner reimbursement, no cost-follows-the-loser netting).
- `pot = N·S − fee` → prevailing party. Neutral → everyone back minus their
  fee share. `Failed` → everyone whole (fee un-consumed is refundable).
- Party==juror overlap: accepted, documented risk (draw-time exclusion is
  structurally impossible against stake-weighted MST; outvoting one seat is
  cheap and appeals are open). Spam-safe by construction: **silence is a safe
  strategy for the named** — ignoring a case kills it at the deadline with a
  full refund; the opener eats rent + lockup.

## Invariants

1. Vault balance `== N·S` between last join and file; `== N·S − fee` while live; always `≥` outstanding per-party claims until `Closed`.
2. One Accord dispute per case (bound at file; `dispute` field immutable after).
3. Every payout is idempotent (per-party `paid_out` bits) and pull-based — no push transfers to parties.
4. Option↔party mapping is deterministic program state (naming order); parties never construct options.

## Evidence integration (daemon work — bean `accord-ybuq`)

The evidence daemon gains a **pre-dispute grouping key**: the case PDA (hex of
base58). Parties push encrypted bundles independently for a not-yet-created
Accord dispute, grouped by case + party slot; the daemon assembles the
multi-bundle manifest (ADR-0017 + party field) and verifies the assembled set
matches the on-chain commitment at file. Crypto unchanged (ADR-0015).

## Dependencies

- `accord-n3vw` (Accord Core tie→redraw) — **blocks e2e**.
- Evidence daemon grouping + multi-party manifests — blocks the evidence happy
  path, not the program.
- SDK: `@useaccord/synod` facade (Codama + PDA helpers) when build starts;
  CLI + e2e per AGENTS.md change-coupling rules.

## References

ADR 0002 / 0004 / 0018 / 0020 / 0021 / 0023 / 0025 · `meta/specs/PROG-MULTI-PARTY.md`
· beans `accord-n3vw`, `accord-s72c` · `CONTEXT.md`.
