# Accord Canon — a curated-list Arbitrable over Accord

Accord Canon ("Canon") is a **separate Solana program** that runs curated-list
/ token-registry markets, with entry disputes adjudicated by Accord via CPI. It
is **not** a Subaccord or court configuration of Accord — it is an *Arbitrable*
(a client of Accord's arbitration). **Accord Core is unchanged by Canon.**

Each Canon **list** is a permissionless, token-agnostic curated registry. A
submitter lists an item by locking a permanent deposit; the item is `Pending`
through a challenge window, then `Listed`; anyone may challenge at any time,
which files an Accord dispute (`options = [keep, remove]`); Accord's ruling
adds or removes the item. Economics follow **Stake-Curate** (permanent deposits

+ progressive protection + challenger accountability), detailed in
`programs/canon/SPEC.md`.

Canon is the first-party reference Arbitrable for Accord's highest-value
beachhead (Solana token-authenticity; see `CURATED-LIST.md`), but the program is
a **general curated-list factory** — token-authenticity is the v1 flagship
instance, not the whole product.

## Considered Options

**What Canon is.**

+ **A Subaccord/court configuration of Accord.** Rejected — conflates the
  arbitrator with one of its clients; the registry's submitter/challenger
  economics are invisible to Accord and belong in a separate program.
+ **A separate Arbitrable program over Accord (chosen).** Clean separation:
  Accord stays the neutral arbitration layer; Canon owns the item lifecycle +
  deposits and files disputes via CPI. Mirrors Kleros (court = Kleros; registry
  = Curate/Scout).

**List ↔ Subaccord cardinality.**

+ One shared Subaccord per token (juror-pool densification). Rejected — loses
  the per-list specialist-pool self-selection that is Accord's competence model.
+ **1:1 — each list creates its own Subaccord at `create_list` (chosen).** Locks
  the court to the list; specialist juror pool per list; full per-list
  sovereignty. Residual (pool fragmentation as list count grows) is mitigated by
  launching few canonical lists first.

**Dispute-parameter ownership.**

+ List creator sets the Accord court params. Rejected — a permissionless creator
  can mis-parameterize a court into capturability.
+ **Canon enforces canonical dispute-mechanism defaults** (`initial_num_jurors`,
  `max_appeals`, `alpha_bps`, `fee_per_juror`, windows, `evidence_operator`)
  per token/risk tier (chosen). Creator owns only registry economics + token
  choice.

**Token model.**

+ Canon issues/mandates a governance token. Rejected — contradicts the
  no-Canon-protocol-token stance; speculates on capture risk.
+ **Token-agnostic: the list creator supplies `stake_mint` + `fee_mint`** (which
  may be the same mint) at `create_list`; Canon forwards both to Accord's
  `create_subaccord` and is otherwise neutral (chosen). Registry economics are
  denominated in `fee_mint`; juror stake/slash in `stake_mint`. Capture
  resistance is inherited from Accord's VRF-distinct-draw-with-caps, not Canon's
  to provide.

**Registry economics.**

+ Classic refundable-deposit TCR. Rejected — gameable (list → withdraw →
  relist); Kleros's own 2026 Stake-Curate is an admission of this.
+ **Stake-Curate: permanent deposits + progressive protection + challenger
  accountability + full-accumulated bounty (chosen).** See SPEC §Economics.

**Lifecycle.**

+ Immediate-list, reactive-challenge only. Rejected — stamps the "verified"
  mark on scams instantly.
+ **Windowed-then-listed** (`Pending` → challenge window → `Listed | Dispute`),
  with listed items perpetually re-challengeable and a timelocked +
  challengeable withdrawal path (chosen).

## Consequences

+ **Accord Core is unchanged.** Canon consumes Accord via two CPIs:
  `create_subaccord` (at `create_list`) and `create_dispute` (at `challenge`).
  Canon reads `get_ruling` to settle item state + deposits.
+ **Two stake pools, cleanly separated:** juror stake/slash in Accord
  (`JurorStake`, in `stake_mint`); item deposits in Canon (`CanonItem`, in
  `fee_mint`). Accord is unaware of submitter/challenger.
+ **Account model:** `CanonList ["canon", creator, domain_ref_hash]` (carries
  `list_program` — the program whose accounts this list curates, immutable),
  `CanonItem ["canon-item", list, account]` (the curated account, a PDA owned
  by `list_program`); reuses Accord `Dispute`/`Round`.
+ **Item = any program-owned account (Q15).** Canon curates accounts-by-
  reference: an item is a PDA owned by the list's `list_program`, which may
  carry any data (a mint, NFT, text blob, arbitrary program state). Canon
  verifies `account.owner == list_program` at `submit_item` and is otherwise
  agnostic to the content (which `list_program` may mutate outside Canon's
  control — accepted for v1).

+ **Capture resistance is not Canon's responsibility** — it inherits Accord's
  VRF-distinct-draw-with-caps. A list's capture surface = creator's token choice
  × Accord's draw caps.
+ **Out of scope (v1):** ATQ "code-as-item" scaling, multi-surface distribution
  (wallet/explorer/DEX), per-list custom dispute-param tiers. See SPEC §Out of
  scope.

## Authority

`programs/canon/SPEC.md` (implementation reference) · `CURATED-LIST.md` (design
seed) · `programs/accord/SPEC.md` + ADR-0001 / 0002 / 0004 / 0019 (Accord Core)
· `CONTEXT.md`, `BRAND.md`.
