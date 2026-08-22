# Accord Canon — v1 Build Specification

> **Status:** built. **Authority:** `canon-0001` (architecture + Stake-Curate
> economics), `canon-0003` (retuning + governance key), `CURATED-LIST.md`
> (design seed), `programs/accord/SPEC.md` (Accord Core). This file is the
> implementation reference for Canon: account model, instructions, state
> machine, economics. Code is authority on current state; this spec is
> authority on intent.

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

| Account     | Seeds                            | Key fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `CanonList` | `["canon", creator, rules_hash]` | `stake_mint`, `fee_mint`, `list_program` (program whose accounts this list curates; `Pubkey::default()` ⇒ ownership check **disabled** — curate arbitrary base58 data; immutable), `rules_hash` (public listing criteria jurors apply; immutable; passed to Accord as the Subaccord `domain_ref`), `subaccord` (1:1 backing court), `submit_deposit`, `challenge_pct` (bps), `listing_window`, `withdrawal_timelock`, `authority` (governance key: the creator at `create_list`, rotatable via `update_list`; gates `update_list` + `propose_court_update` — canon/0003; distinct from the Subaccord authority, which is the list PDA itself, pinned), `item_count`, `bump`. `rules_hash` + `list_program` immutable. |
| `CanonItem` | `["canon-item", list, account]`  | the curated `account: Pubkey` (a PDA owned by `list_program`), `state` (`Pending`/`Listed`/`Removed`/`WithdrawPending`/`Disputed`), `submitter`, `accumulated_stake` (in `fee_mint`), challenge/withdrawal history, `bump`.                                                                                                                                                                                                                                                                       |
| token vault | `CanonList`-PDA-owned SPL        | deposit pool (`fee_mint`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Canon **reuses** Accord's `Dispute`, `Round`, `JurorStake`, and the per-list
backing `Subaccord`. It does **not** reimplement voting, the draw, or juror
staking.

## Instructions

| #   | Instruction                                                                                                                                                                                                                                     | Semantics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `create_list(stake_mint, fee_mint, list_program, rules_hash, submit_deposit, challenge_pct, listing_window, withdrawal_timelock, evidence_operator, court: CourtParams)` — mints passed as validated `Mint` **accounts**, stored on `CanonList` | permissionless; records `list_program` (the program whose accounts this list curates; immutable); CPIs Accord `create_subaccord` (staking token `stake_mint`, fee token `fee_mint`, court profile from `court` with `aggregation = Plurality` / `shortfall_policy = Redraw` / `coherence_tol_bps = 0` / `authority = CanonList PDA` pinned — canon/0002; `evidence_operator` forwarded — `Pubkey::default()` rejected with `InvalidEvidenceOperator`); canon-side guards (only what the CPI doesn't check): `alpha_bps <= 10_000` (`AlphaTooHigh`), nonzero review/commit/reveal windows (`WindowTooShort`), `depth <= MAX_LIST_TREE_DEPTH = 8` (`TreeDepthTooDeep`); every other validation is Accord's at the CPI (errors propagate); inits `CanonList`. `stake_mint` may equal `fee_mint`.                                                                                                                       |
| 2   | `submit_item(list, account, deposit = submit_deposit)`                                                                                                                                                                                                | verifies `account.owner == list.list_program`; locks `submit_deposit` (in `fee_mint`) permanently; `CanonItem` (keyed by the account) → `Pending`.                                                                                                                                                                                                                                                    |
| 3   | `advance_pending(item)`                                                                                                                                                                                                                         | permissionless crank; after `listing_window` with no challenge → `Listed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4   | `challenge_item(item, evidence)`                                                                                                                                                                                                                | locks `challenge_stake = challenge_pct × item.accumulated_stake` **+** `accord_fee` (in `fee_mint`); CPIs Accord `create_dispute(options = [keep, remove], evidence_hash, fee)`. Usable from `Pending`, `Listed`, or `WithdrawPending`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 5   | `settle_item(item)`                                                                                                                                                                                                                             | permissionless crank after the Accord dispute finalizes; reads Accord's `final_ruling: u64` via `Dispute::ruling()` (`Option<u64>`; Canon files Plurality disputes only, so the ruling is an option index — gate `ruling < 2`, u64 since ADR-0025). `keep` (0) → `challenge_stake` → `item.accumulated_stake` (progressive protection), fee consumed by jurors, item → `Listed`. `remove` (1) → `accumulated_stake + challenge_stake` (bounty + the challenger's own stake back) → challenger, item → `Removed`. Terminal `Failed` (cancel / redraw exhaustion) → no ruling: `accumulated_stake` → submitter, `challenge_stake` → challenger (no bounty, no forfeit), item → `Removed`. Emits `ItemSettled{ruling: u64}` / `ItemSettlementVoided`. Payout destinations are constrained on-chain to the payee recorded on the item (`token::mint = fee_mint`, `token::authority = item.challenger\|item.submitter`). |
| 6   | `request_withdrawal(item)`                                                                                                                                                                                                                      | submitter-only; item → `WithdrawPending`; opens the `withdrawal_timelock` challenge window.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 7   | `advance_withdrawal(item)`                                                                                                                                                                                                                      | permissionless crank; after the timelock, if unchallenged → return `accumulated_stake` to submitter, item → `Removed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8   | `close_item(item)`                                                                                                                                                                                                                              | permissionless PDA close of a settled item; guards `state == Removed` (`NotRemoved` otherwise — incl. mid-dispute), plus the terminal invariants `accumulated_stake == 0` (`StakeOutstanding`) and no live `active_dispute`; emits `ItemClosed { list, item, account, submitter }` then closes with rent → `caller`. No `CanonList` account — the PDA is self-seeded from `item.list` / `item.account` / `item.bump`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 9   | `update_list(submit_deposit, challenge_pct, listing_window, withdrawal_timelock, new_authority)`                                                                                                                                                | authority-gated (`CanonList.authority` — the creator at creation, rotatable via `new_authority`; `Pubkey::default()` = keep) instant retune of the list-level economics. No timelock: deposits lock per-item at `submit_item`, `challenge_pct` applies at the next challenge, windows gate future crank advances — nothing in-flight can be retroactively stolen. Guards: `submit_deposit > 0` (`ZeroDeposit`), `challenge_pct <= 10_000` (`ChallengePctTooHigh`), windows > 0 (`WindowTooShort`), authority match (`Unauthorized`). Emits `ListUpdated`. |
| 10  | `propose_court_update(nonce, payload: UpdatePayload)`                                                                                                                                                                                            | authority-gated CPI into Accord `propose_subaccord_update`: the CanonList PDA signs as the Subaccord authority (`invoke_signed`), the caller (the list authority) pays the `PendingUpdate` rent (ADR-0028 rent-payer split). Arms the 48h `UPDATE_TIMELOCK_SLOTS` timelock; execution is Accord's permissionless `execute_subaccord_update` — no canon wrapper. Canon guards: reject `UpdatePayload::Authority` (`ForbiddenPayload` — the court authority is pinned to the list PDA forever), `AlphaBps <= 10_000` (`AlphaTooHigh`), nonzero review/commit/reveal windows (`WindowTooShort`); everything else rides Accord's `validate_update_payload` + cross-field checks. Emits `CourtUpdateProposed`. |

A challenge filed during `WithdrawPending` re-enters the dispute path
(`challenge_item` → `settle_item`); see state machine.

## Item state machine

```
submit + permanent deposit ──► PENDING ──(listing_window)──┬── unchallenged ──► LISTED
                                                           └── challenged ───► ACCORD DISPUTE [keep | remove]
                                                                  ├─ keep   ► LISTED  (challenge_stake → accumulated_stake; fee → jurors)
                                                                  ├─ remove ► REMOVED (accumulated_stake + challenge_stake → challenger; fee → jurors)
                                                                  └─ failed ► REMOVED (no ruling; accumulated_stake → submitter, challenge_stake → challenger)
LISTED ──(challenge_item, anytime)──► ACCORD DISPUTE ──► LISTED (+protection) | REMOVED
LISTED ──(request_withdrawal)──────► WITHDRAW-PENDING (withdrawal_timelock + challengeable)
                                        ├── unchallenged ► WITHDRAWN (deposit → submitter; item Removed)
                                        └── challenged ──► ACCORD DISPUTE ─► submitter-keeps | challenger-bounty
                                                            (item Removed either way)
```

`REMOVED` is not final-final: any caller may `close_item` the PDA (rent →
caller). Closing frees the `["canon-item", list, account]` seed, so the same
curated `account` can be re-submitted later — a fresh deposit, `challenge_count`
reset to 0, progressive protection restarting from `submit_deposit` (the
cheap-to-challenge zone; a re-submit cycle bleeds the scammer and pays
challengers each round). Durable history lives in events (`ItemSettled` /
`ItemSettlementVoided` / `Withdrawn` / `ItemClosed`), not in tombstone accounts.

## Economics (Stake-Curate; all amounts in `fee_mint`)

- **Permanent deposit.** `submit_item` locks `submit_deposit`; not refundable
  except via the withdrawal path. Skin-in-the-game cannot be yanked to escape a
  live challenge.
- **Progressive protection.** Each _failed_ challenge (ruling `keep`) adds the
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

## Court profile (`CourtParams`) and canonical defaults

Each Canon list's court params live on its 1:1 backing Subaccord (per-list, not
global). Since canon/0002 the list creator sets them at `create_list` via the
grouped `court: CourtParams` argument; the table below is the canonical
default profile, returned by `defaultCourtParams()` in `@useaccord/canon` (the
dApp create form pre-fills every court field from the helper; the e2e tests
call it directly; power users spread-and-override individual fields). The
program itself pins what is protocol identity rather than taste:
`aggregation = Plurality` (Canon files 2-option `[keep, remove]` disputes
only, ADR-0019/0025), `shortfall_policy = Redraw`, `coherence_tol_bps = 0`
(inert under Plurality), `authority` = the CanonList PDA, and
`juror_credential` / `juror_schema` = `default()` (attestation gating is
separate scope).

Canon guards only what Accord's `create_subaccord` CPI does not already
validate: `alpha_bps <= 10_000` (`AlphaTooHigh` — no slash factor above 100%),
nonzero review/commit/reveal windows (`WindowTooShort` — zero windows would
brick disputes forever and strand third-party item deposits), and `depth <=
MAX_LIST_TREE_DEPTH = 8` (`TreeDepthTooDeep` — every stake/draw tx carries a
depth-length MST path at ~40 B/level, ADR-0012; depth 8 keeps the stake tx
≈ 900 B under the 1232-byte limit). Everything else (appeals cap, odd
`min_jury_size`, ladder fit, reveal threshold, draw attempts, appeal-window
floor) is Accord's validation at the CPI — its errors propagate.
Once created, the court params are retunable **only through canon's gated
`propose_court_update`** (canon/0003) — the Subaccord authority is pinned to
the **CanonList PDA itself** (`create_list` CPIs it that way), so no external
key can ever touch the court directly. `propose_court_update` lets the list
authority (the creator, rotatable via `update_list`) CPI Accord's
`propose_subaccord_update` with the list PDA as `invoke_signed` signer and the
caller as rent payer; the 48h timelock and the permissionless
`execute_subaccord_update` (called directly on Accord — canon ships no
wrapper) apply, per ADR-0005/0028. Two things are forever out of reach:
`UpdatePayload::Authority` (canon rejects it with `ForbiddenPayload` —
rotating the court authority off the list PDA would permanently strand
retuning) and `min_jury_size` / `depth`, which are **set-once**: immutable on
the Subaccord (absent from `UpdatePayload`), irreversible list-creation
choices.

`CourtParams` fields (canonical defaults):

| param                  | default     | notes                                                               |
| ---------------------- | ----------- | ------------------------------------------------------------------- |
| `min_stake`            | 1_000       | min juror stake for draw eligibility (in `stake_mint`)              |
| `alpha_bps`            | 1_000 (10%) | slash factor; canon guard `<= 10_000`                               |
| `review_window`        | 7d          | nonzero (canon guard)                                               |
| `commit_window`        | 2d          | nonzero (canon guard)                                               |
| `reveal_window`        | 2d          | nonzero (canon guard)                                               |
| `appeal_window`        | 3d          | Accord floor `MIN_APPEAL_WINDOW_SECS` (ADR-0022)                    |
| `max_appeals`          | 3           | 3 → 7 → 15 → 31 ladder                                              |
| `min_jury_size`        | 3           | round-1 panel (ADR-0019); **set-once** — immutable on the Subaccord |
| `fee_per_juror`        | 10          | in `fee_mint`; round-1 ≈ 30                                         |
| `reveal_threshold_bps` | 6_666 (2/3) | reveal quorum (ADR-0021)                                            |
| `max_draw_attempts`    | 3           | same-size redraws per round (ADR-0021)                              |
| `depth`                | 8           | accumulator tree depth (ADR-0012); canon guard `<= 8`; **set-once** |

`evidence_operator` stays its own `create_list` arg (not a `CourtParams`
field): creator-supplied, deployment-configured (dApp:
`VITE_EVIDENCE_OPERATOR_ADDRESS`); must be a real key held by the daemon's
keyring (ADR-0006/0011) — a zero key can never be an ECIES target.

List-level economics (already per-list `create_list` args, stored on
`CanonList`):

| param                 | default        | notes                                                 |
| --------------------- | -------------- | ----------------------------------------------------- |
| `submit_deposit`      | 500            | in `fee_mint`; base skin (recoverable via withdrawal) |
| `challenge_pct`       | 50% (5000 bps) | challenger stakes half the accumulated stake          |
| `listing_window`      | 5 days         | watcher time to catch a scam before auto-list         |
| `withdrawal_timelock` | 5 days         | final fraud-challenge window (matches listing_window) |

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
  the project's official account + deployer signature"). Canon defines the
  hash's bytes as `sha256(rules_doc)` over the **raw file bytes** and hosts the
  preimage on the evidence daemon's public content-addressed CAS
  (`PUT`/`GET /domains/{hash}`, ADR-0027 as amended): PUT is chain-anchored
  and create-first — the daemon resolves the backing Subaccord
  (`?subaccord=<addr>`, polled ≤ 1 s for commitment lag) and requires
  `domain_ref == rules_hash` before storing anything; `GET` returns the bytes
  and the client verifies `sha256(bytes) == rules_hash`. Recommended format:
  markdown with optional YAML frontmatter (`title`, `description` — no
  `version`; the hash is the version); the convention's single home is
  `packages/sdk/src/domain.ts` (`hashDomainDoc` / `parseDomainDoc` /
  `verifyDomainDoc` / `fetchDomainDoc`) — no second implementation. Passed to
  Accord as the Subaccord `domain_ref` (opaque bytes there; the sha256-doc
  definition is canon's).
- **Evidence (juror-only, dispute-level, single-party).** The per-dispute
  manifest (`evidence_hash`, `accord-evidence/v1`) carries the `item` reference
  plus the **challenger's** claim and proof — the challenger files via Canon
  (single filer, ADR-0004); the submitter does not file rebuttal evidence.
  Re-encrypted for drawn jurors per ADR-0006. The submitter's recourse against a
  wrong `remove` is the permissionless appeal ladder (two-party Accord disputes
  are a future extension, bean `accord-s72c`).

Because Canon is the filer, item → list → `rules_hash` resolution is trivial.
Publishing is create-first (ADR-0027 amendment): the doc is hashed
client-side, `create_list` lands with `rules_hash = hash`, and the bytes go to
`PUT /domains/{hash}?subaccord=<backing Subaccord>` once the create-tx
confirms — publish failure ≠ creation failure, and the half-state (list live,
doc missing) stays loud with retry. `useaccord domain:put` / `domain:get`
(with `--daemon-url` / `ACCORD_DAEMON_URL`) remain the manual publish/verify
commands; see `.agents/skills/useaccord/` for current flags. Jurors apply the
public rules to the juror-only evidence → `keep` / `remove`.

## Edge cases & defaults

- **Withdrawal challenged:** the item is `Removed` either way (the submitter is
  delisting); the dispute decides only whether the submitter **keeps** the
  deposit (item was legit) or **forfeits** it to the challenger (item was a
  scam). On a failed withdrawal-block (`keep`), the challenger's stake goes to
  the submitter (frivolous-block penalty).
- **Accord dispute `Failed` (escape hatch):** a failed/cancelled Accord dispute
  carries no ruling, so nobody won or lost — `settle_item` refunds the
  submitter's `accumulated_stake`, returns the challenger's `challenge_stake`
  (no bounty, no forfeit), and `Removed`s the item. The Accord filer fee is
  already refunded to the vault by `cancel_dispute` / redraw exhaustion.
- **Re-challenge while `Listed`:** re-uses `challenge_item`; progressive
  protection continues to accumulate.
- **No cancel during `Pending` (v1):** a submitted item is committed through the
  `listing_window`; exit is via the withdraw path after `Listed`, not an early
  cancel.
- **Cranks:** `advance_pending` / `settle_item` / `advance_withdrawal` are
  permissionless and **unrewarded** in v1 — the motivated party cranks (submitter
  wants listing/withdrawal; challenger wants the bounty).
- **Program upgrade authority:** the Canon program mirrors Accord ADR-0007 —
  Squads multisig, then post-audit freeze.
- **Insufficient accord_fee / challenge_stake:** `challenge_item` reverts.

- **`close_item` rent bounty:** the closer pockets the item's rent-exempt
  lamports — a live submitter self-cranks and recovers the rent they paid at
  `submit_item`; abandoned / adjudicated-scam items are self-funding GC
ATQ "code-as-item" scaling (curate tagging _modules_, not individual items) ·
multi-surface distribution (wallet snap / explorer / DEX) · post-creation
retuning shipped with canon/0003 (`update_list` instant + `propose_court_update`
timelocked, authority-gated in the dApp's list detail page) · badges/tiers as
separate Canon lists.

## Authority

`canon-0001` · `canon-0002` · `canon-0003` · `CURATED-LIST.md` ·
`programs/accord/SPEC.md` · Accord ADR-0001 / 0002 / 0004 / 0005 / 0019 /
0021 / 0022 / 0025 / 0027 / 0028 · `CONTEXT.md` · `BRAND.md`.
