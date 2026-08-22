# Retuning path + governance key (`update_list` / `propose_court_update`)

canon/0002 made the court profile creator-supplied at `create_list` and pinned
the backing Subaccord's `authority` to the **CanonList PDA** — "the retuning
upgrade path; a creator-set authority would burn it forever". Until now that
path was a stub: the PDA signed nothing, so every court param was as immutable
as the day the list was created, and the list-level economics
(`submit_deposit`, `challenge_pct`, windows) were frozen the same way. This
ADR ships the retuning path the pinned-PDA design anticipated (requires
Accord's ADR-0028 rent-payer split, which made PDA-authority updates CPI-able).

## Decision

1. **`CanonList.authority` becomes the governance key** — set to the **creator**
   at `create_list`, rotatable via `update_list` itself. Zero layout change:
   the field previously mirrored the list PDA (a display value that gated
   nothing). The Subaccord's `authority` stays the CanonList PDA **forever** —
   canon rejects `UpdatePayload::Authority` (`ForbiddenPayload`), because
   rotating the court authority off the PDA would permanently strand every
   future retune behind a key that can never again sign through canon.

2. **`update_list` — instant, authority-gated list-param retune** (+ optional
   authority rotation; `Pubkey::default()` = keep). Deliberately NOT
   timelocked: deposits lock per-item at `submit_item`, `challenge_pct`
   applies at the next `challenge_item`, and the windows only gate future
   crank advances — no in-flight value can be retroactively stolen, so a
   timelock would protect nothing. Guards: `submit_deposit > 0`
   (`ZeroDeposit`), `challenge_pct <= 10_000` (`ChallengePctTooHigh`),
   windows > 0 (`WindowTooShort`), authority match (`Unauthorized`).

3. **`propose_court_update(nonce, payload: UpdatePayload)` — the gated CPI**
   into Accord's `propose_subaccord_update`: the CanonList PDA signs as the
   Subaccord authority (`invoke_signed`), the caller (the list authority) pays
   the `PendingUpdate` rent (ADR-0028 split — the data-carrying PDA cannot).
   The 48h `UPDATE_TIMELOCK_SLOTS` timelock and the **permissionless**
   `execute_subaccord_update` live entirely in Accord; canon ships **no
   execute wrapper** (cranker / CLI / dApp call Accord directly). Canon adds
   only the create_list guard mirrors — `AlphaBps <= 10_000`
   (`AlphaTooHigh`), nonzero review/commit/reveal windows (`WindowTooShort`)
   — everything else rides Accord's `validate_update_payload` +
   cross-field checks. `min_jury_size` / `depth` remain set-once (absent from
   `UpdatePayload`).

4. **CLI:** `canon:update` (omitted flags keep their on-chain value — the
   command fetches the list and passes the current value through) and
   `canon:court-update --payload Kind:value` (rejects `Authority`
   client-side too, emits `executeAfterSlot`; land via
   `lifecycle:execute-update`).

5. **dApp:** `ListDetailPage` renders the retuning surface only when the
   connected wallet `== list.authority` (`canUpdateList`, unit-tested; same
   precedent as `canRequestWithdrawal`). List params form → `updateList`
   (instant refetch); court field+value picker (never offers `Authority` /
   immutable fields) → `proposeCourtUpdate` → `executeAfterSlot` readback →
   countdown + permissionless Execute.

## Considered Options

**Who governs.**

+ **Subaccord-authority-as-governor (wallet set as court authority).**
  Rejected — impossible without burning the pinned-PDA invariant: the court
  authority is immutable on the Subaccord, so the PDA can never be rotated
  back. Governance must live canon-side.
+ **Multisig / timelock contract as governance.** Premature — v1 lists are
  creator-run; the governance key is rotatable, so an operator can move to a
  multisig later without a program change.
+ **Creator key, rotatable in-protocol (chosen).** Simplest thing that keeps
  the upgrade path open and the blast radius small (worst case: the authority
  key mismanages ONE list, not the court program).

**Timelock the list params too?** Rejected — nothing retroactive is at stake
(see Decision 2); a 48h delay on `challenge_pct` would slow scam responses
without protecting anyone. Court params keep the timelock because they change
dispute ADJUDICATION for every future dispute.

**Wrap execute in canon?** Rejected — Accord's `execute_subaccord_update` is
permissionless by design (ADR-0005); a canon wrapper would add an account and
a signature for zero added control.

## Consequences

+ A lost governance key locks list-param retuning forever (mitigation: rotate
  early, rotate to a multisig); items and disputes are unaffected — the list
  still adjudicates, deposits still settle.
+ `challenge_pct`/`submit_deposit` changes apply prospectively; existing
  items keep their locked stake (progressive-protection history is
  item-scoped).
+ e2e: `canon.update.spec.ts` (propose → slot warp → direct Accord execute →
  Subaccord mutated; Authority variant rejected); LiteSVM:
  `programs/canon/tests/update_litesvm.rs` (auth gate, rotation,
  guard matrix, CPI success).
