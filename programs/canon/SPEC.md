# Accord Canon — v1 Build Specification

> **Status:** specified (not yet built). **Authority:** `canon-0001`
> (architecture + Stake-Curate economics), `CURATED-LIST.md` (design seed),
> `programs/accord/SPEC.md` (Accord Core). This file is the implementation
> reference for Canon: account model, instructions, state machine, economics.
> Code is authority on current state; this spec is authority on intent.

## Overview

`programs/canon` is a curated-list / token-registry **Arbitrable** that runs on
top of Accord. Each Canon **list** is a permissionless, token-agnostic curated
registry; entry disputes are adjudicated by a per-list Accord Subaccord via
CPI. Canon owns the item lifecycle + item deposits; Accord owns juror staking,
the VRF draw, commit-reveal voting, and the ruling.

Canon is the first-party reference Arbitrable for Accord's curated-list
beachhead (v1 flagship instance: Solana token-authenticity). The program is a
general curated-list factory — any token, NFT collection, address-tag, or
arbitrary registry.

## Account / PDA model

| Account | Seeds | Key fields |
| --- | --- | --- |
| `CanonList` | `["canon", creator, rules_hash]` | `stake_mint`, `fee_mint`, `list_program` (program whose accounts this list curates; `Pubkey::default()` ⇒ ownership check **disabled** — curate arbitrary base58 data; immutable), `rules_hash` (public listing criteria jurors apply; immutable; passed to Accord as the Subaccord `risk_type`), `subaccord` (1:1 backing court), `submit_deposit`, `challenge_pct` (bps), `listing_window`, `withdrawal_timelock`, `authority`, `item_count`, `bump`. `rules_hash` + `list_program` immutable. |
| `CanonItem` | `["canon-item", list, account]` | the curated `account: Pubkey` (a PDA owned by `list_program`), `state` (`Pending`/`Listed`/`Removed`/`WithdrawPending`/`Disputed`), `submitter`, `accumulated_stake` (in `fee_mint`), challenge/withdrawal history, `bump`. |
| token vault | `CanonList`-PDA-owned SPL | deposit pool (`fee_mint`) |

Canon **reuses** Accord's `Dispute`, `Round`, `JurorStake`, and the per-list
backing `Subaccord`. It does **not** reimplement voting, the draw, or juror
staking.

## Instructions

| # | Instruction | Semantics |
| --- | --- | --- |
| 1 | `create_list(stake_mint, fee_mint, list_program, risk_type)` | permissionless; records `list_program` (the program whose accounts this list curates; immutable); CPIs Accord `create_subaccord` (staking token `stake_mint`, fee token `fee_mint`, **Canon canonical dispute-mechanism defaults**); inits `CanonList`. `stake_mint` may equal `fee_mint`. |
| 2 | `submit_item(list, account, evidence, deposit = submit_deposit)` | verifies `account.owner == list.list_program`; locks `submit_deposit` (in `fee_mint`) permanently; `CanonItem` (keyed by the account) → `Pending`. |
| 3 | `advance_pending(item)` | permissionless crank; after `listing_window` with no challenge → `Listed`. |
| 4 | `challenge_item(item, evidence)` | locks `challenge_stake = challenge_pct × item.accumulated_stake` **+** `accord_fee` (in `fee_mint`); CPIs Accord `create_dispute(options = [keep, remove], evidence_hash, fee)`. Usable from `Pending`, `Listed`, or `WithdrawPending`. |
| 5 | `settle_item(item)` | permissionless crank after the Accord dispute finalizes; reads Accord's `final_ruling`. `keep` → `challenge_stake` → `item.accumulated_stake` (progressive protection), fee consumed by jurors, item → `Listed`. `remove` → `item.accumulated_stake` → challenger (bounty), item → `Removed`. |
| 6 | `request_withdrawal(item)` | submitter-only; item → `WithdrawPending`; opens the `withdrawal_timelock` challenge window. |
| 7 | `advance_withdrawal(item)` | permissionless crank; after the timelock, if unchallenged → return `accumulated_stake` to submitter, item → `Removed`. |

A challenge filed during `WithdrawPending` re-enters the dispute path
(`challenge_item` → `settle_item`); see state machine.

## Item state machine

```
submit + permanent deposit ──► PENDING ──(listing_window)──┬── unchallenged ──► LISTED
                                                           └── challenged ───► ACCORD DISPUTE [keep | remove]
                                                                  ├─ keep   ► LISTED  (challenge_stake → accumulated_stake; fee → jurors)
                                                                  └─ remove ► REMOVED (accumulated_stake → challenger; fee → jurors)
LISTED ──(challenge_item, anytime)──► ACCORD DISPUTE ──► LISTED (+protection) | REMOVED
LISTED ──(request_withdrawal)──────► WITHDRAW-PENDING (withdrawal_timelock + challengeable)
                                        ├── unchallenged ► WITHDRAWN (deposit → submitter; item Removed)
                                        └── challenged ──► ACCORD DISPUTE ─► submitter-keeps | challenger-bounty
                                                            (item Removed either way)
```

## Economics (Stake-Curate; all amounts in `fee_mint`)

- **Permanent deposit.** `submit_item` locks `submit_deposit`; not refundable
  except via the withdrawal path. Skin-in-the-game cannot be yanked to escape a
  live challenge.
- **Progressive protection.** Each *failed* challenge (ruling `keep`) adds the
  challenger's forfeited `challenge_stake` to `item.accumulated_stake`.
  Dislodging a long-standing, many-times-defended item costs proportionally
  more — vetting effort concentrates on new items (where fraud lives).
- **Challenger accountability.** `challenge_stake = challenge_pct ×
  item.accumulated_stake` (forfeited on a failed challenge).
- **Bounty = full accumulated.** On `remove`, the challenger receives the item's
  full `accumulated_stake` (original deposit + all prior forfeited challenge
  stakes). The reward scales with how established the item was — the harder it
  was to remove, the bigger the payoff for being right.
- **Accord fee.** The challenger fronts `accord_fee`; Canon forwards it to
  Accord as the filer; consumed by Accord (coherent jurors). Dollar-legible
  throughout (`fee_mint`, default USDC).

## v1 canonical defaults

One set for all Canon lists (no per-tier variation in v1); retunable via the
Subaccord authority timelock as real dispute/juror data arrives.

| param | v1 value | notes |
| --- | --- | --- |
| `initial_num_jurors` | 3 | ADR-0019 default; round-1 panel |
| `max_appeals` | 3 | 3 → 7 → 15 → 31 ladder |
| `alpha_bps` | 1000 (10%) | Accord v1 slash default |
| review / commit / reveal | 7d / 2d / 2d | Accord v1 defaults |
| `evidence_operator` | canonical Accord/Canon operator | ADR-0006 |
| `fee_per_juror` | 10 | in `fee_mint`; round-1 ≈ 30 |
| `submit_deposit` | 500 | in `fee_mint`; base skin (recoverable via withdrawal) |
| `challenge_pct` | 50% (5000 bps) | challenger stakes half the accumulated stake |
| `listing_window` | 5 days | watcher time to catch a scam before auto-list |
| `withdrawal_timelock` | 5 days | final fraud-challenge window (matches listing_window) |

## Token model

Token-agnostic. The list creator supplies `stake_mint` (juror stake/slash,
passed to the backing Subaccord) and `fee_mint` (Canon registry economics +
Accord fee). They may be the **same mint** (single-token) or **different**
(governance-stake + stable-fee). Canon is neutral on the choice; capture
resistance is inherited from Accord's VRF-distinct-draw-with-caps, not provided
by Canon.

## Rules & evidence

Each dispute's ruling applies the **list's rules** to the **item's evidence**:

- **Rules (public, list-level, stable).** `CanonList.rules_hash` anchors an
  off-chain rules doc — the listing criteria (e.g. "canonical mint verified by
  the project's official account + deployer signature"). Public by nature
  (transparent criteria ⇒ consistent, auditable rulings); anyone reads and
  verifies it against the on-chain hash. Passed to Accord as the Subaccord
  `risk_type`.
- **Evidence (juror-only, dispute-level).** The per-dispute manifest
  (`evidence_hash`, `accord-evidence/v1`) carries the `item` reference plus the
  submitter/challenger claim and proof, re-encrypted for drawn jurors per
  ADR-0006.

Because Canon is the filer, item → list → `rules_hash` resolution is trivial;
because the rules are public, the evidence operator needs no extension (it only
ever re-encrypts the per-dispute evidence). Jurors apply the public rules to the
juror-only evidence → `keep` / `remove`.

## Edge cases & defaults

- **Withdrawal challenged:** the item is `Removed` either way (the submitter is
  delisting); the dispute decides only whether the submitter **keeps** the
  deposit (item was legit) or **forfeits** it to the challenger (item was a
  scam). On a failed withdrawal-block (`keep`), the challenger's stake goes to
  the submitter (frivolous-block penalty).
- **Accord dispute `Failed` (escape hatch):** Canon treats a failed/cancelled
  Accord dispute as `remove`-with-no-bounty (refund submitter, no challenger
  payout) — *flag for revisit.*
- **Re-challenge while `Listed`:** re-uses `challenge_item`; progressive
  protection continues to accumulate.
- **Insufficient accord_fee / challenge_stake:** `challenge_item` reverts.

## Out of scope (v2+)

ATQ "code-as-item" scaling (curate tagging *modules*, not individual items) ·
multi-surface distribution (wallet snap / explorer / DEX) · per-list custom
dispute-param tiers · badges/tiers as separate Canon lists.

## Authority

`canon-0001` · `CURATED-LIST.md` · `programs/accord/SPEC.md` · Accord ADR-0001 /
0002 / 0004 / 0019 · `CONTEXT.md` · `BRAND.md`.
