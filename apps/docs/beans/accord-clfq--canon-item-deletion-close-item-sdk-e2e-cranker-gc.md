---
# accord-clfq
title: Canon — item deletion (close_item + SDK + e2e + cranker GC)
status: completed
type: milestone
priority: normal
created_at: 2026-08-14T19:06:00Z
updated_at: 2026-08-19T19:50:11Z
---

---

type: milestone
status: todo
---

Delist ⇒ delete: a permissionless `close_item` instruction for settled `CanonItem` PDAs, the SDK surface for it, the e2e proof, and a cranker canon-module that garbage-collects `Removed` items (event-driven + `getProgramAccounts` sweep). Beans-only planning for item deletion — no other canon scope.

## Design decisions (delist/close working session, 2026-08-14)

- **`close_item(item)` — permissionless PDA close.** Guard `item.state == ItemState::Removed` (plus defensive `accumulated_stake == 0` + no active dispute). Self-seeding: `seeds = [SEED_CANON_ITEM, item.list, item.account]`, `bump = item.bump` — the PDA proves lineage, so NO `CanonList` account in the context. Accounts: `caller` (mut `Signer`, close target) + `item` only.
- **Rent → the caller (closer).** A live submitter self-cranks and recovers the rent they paid at `init`; abandoned / adjudicated-scam items become self-funding GC bounties for whoever cleans them up. Rejected alternatives: payer=submitter (blocks permissionless GC of dead accounts — the exact problem being solved), payer=list PDA (dust pot needing its own drain instruction later), burn (waste). Precedent: Accord `close = caller` on `PendingUpdate` (`programs/accord/src/lib.rs:3780`).
- **Safe because `Removed` ⇒ settled.** All three terminal paths (`advance_withdrawal`, `settle_item` remove-ruling, `settle_item` withdrawal-keep) zero `accumulated_stake` and the active-challenge bookkeeping before flipping to `Removed`.
- **Dedicated instruction, not inline close.** `settle_item` would need a *conditional* close (keep-branch re-lists the item) → manual lamport shuffling instead of Anchor's static `close` — classic bug surface. One boring instruction, one invariant guard.
- **Emit `ItemClosed { list, item, account, submitter }` before draining** — indexers get an explicit tombstone event; an account silently vanishing breaks GPA-derived views.
- **Seed re-open is intentional.** Closing frees `"canon-item", list, account`; the same curated `account` may be re-submitted later (fresh deposit, `challenge_count` resets to 0). A fresh item sits in the cheap-to-challenge zone (low `accumulated_stake`) — exactly where SPEC says fraud lives; a re-submit cycle bleeds the scammer and pays challengers each round. Durable history lives in events (`ItemSettled` / `Withdrawn` / `ItemClosed`); no tombstone account (a tombstone would re-create the rent problem one size smaller).
- **`item_count` untouched** — monotonic stat, not a PDA component, no re-submission collision risk.
- **Cranker profitability:** `CanonItem` rent (~0.0027 SOL) far exceeds tx fees; the closer-pays-rent design makes the GC crank self-funding. Skip items whose rent ≤ fee + margin.

## Non-goals

- No CLI surface (`accord-ktx9` stays parked). No `CanonList` closing. No canon lifecycle cranks in the cranker (`accord-7fj6` stays parked — the canon dispatch seam introduced here is what it later builds on).
- SDK work limited to the new instruction (codegen + `closeItem` facade); no other facade changes.

## HANDOFF

### 1. Happy Path

1. Item reaches `Removed` via any terminal path (advance_withdrawal / settle_item remove / settle_item withdrawal-keep); stake already paid out, bookkeeping zeroed.
2. Any caller invokes `close_item(item)` (via SDK `closeItem`, the cranker, or a wallet).
3. Program guards `state == Removed`, emits `ItemClosed`, Anchor drains rent-exempt lamports to `caller` and zeroes the account data.
4. Cranker canon-module independently discovers `Removed` items — WS account-notification listener (state memcmp) for immediate dispatch, plus the 60s reconciler `getProgramAccounts` sweep with a `state == Removed` memcmp filter — and sends `close_item`, pocketing rent; dispatch store dedupes in-flight keys.

### 2. Data Contract

- Program `programs/canon`: new instruction `close_item`, zero args; accounts `{ caller: Signer<'info> (mut), item: Account<'info, CanonItem> (mut, close = caller) }`; `item` seeds `[SEED_CANON_ITEM, item.list, item.account]`, `bump = item.bump`. New error `NotRemoved` ("Item is not in the Removed state.") in `CanonError`; new event `ItemClosed { list, item, account, submitter }` in `events.rs`.
- SDK `packages/canon` (`@useaccord/canon`): regenerate Codama client; add `closeItem` facade (mirrors existing facade method shape); reuse existing canon-item PDA helper.
- e2e `tests/src/canon.spec.ts`: extend with close + re-submit-after-close assertions.
- Cranker `apps/cranker/src`: `cranks/close-item.ts` + canon wiring in `reconciler.ts` / `listener.ts` / `dispatch.ts` / `state.ts` (dedup).
- Docs: `programs/canon/SPEC.md` (instruction table row #8, state-machine note: `Removed` is closeable and re-submission re-opens the seed), no canon `.qedspec` exists yet — add `programs/canon/canon.qedspec` with the accumulated instruction set per AGENTS §Beans #4 if in scope of the program task.

### 3. Edge Cases & Constraints

- `close_item` MUST revert on `Pending` / `Listed` / `WithdrawPending` / `Disputed` (`NotRemoved`) — closing mid-dispute strands the challenger's bounty path.
- Defensive revert if `accumulated_stake != 0` or `active_dispute != Pubkey::default()` when `state == Removed` (invariant breach = state-machine bug; fail loudly, never strand tokens).
- Never re-create the same PDA in the same tx as the close (Anchor close+init footgun); re-submission is a separate tx by construction (different instruction).
- Rent math: cranker sends close only when lamports > tx fee + margin.
- Re-submitted item starts from `submit_deposit` again — progressive protection resets by design; do NOT try to preserve `challenge_count` across close.

### 4. Business Logic

```rust
// close_item handler (pseudo)
require!(item.state == ItemState::Removed, CanonError::NotRemoved);
require!(item.accumulated_stake == 0, CanonError::StakeOutstanding);
require!(item.active_dispute == Pubkey::default(), CanonError::NotRemoved);
emit!(ItemClosed { list: item.list, item: item.key(), account: item.account, submitter: item.submitter });
// close = caller on the Accounts struct drains rent + zeroes data
```

```ts
// cranker canon-module (pseudo): two triggers, one dedup
onCanonItemNotification(acct) { if (acct.state === 'Removed') dispatchOnce(acct.address, closeItem) }
reconcileTick() { for (item of gpaScan(canonProgram, { memcmp: state == Removed })) dispatchOnce(item.address, closeItem) }
```

### 5. Definition of Done

- [ ] `close_item_litesvm.rs` RED→GREEN: happy close (rent to caller, account gone), `NotRemoved` reverts for all four live states, defensive guards, re-submit-after-close roundtrip
- [ ] `make test_unit` green; `make codegen && pnpm -r run build` green workspace-wide
- [ ] `tests/src/canon.spec.ts` extended: settle-remove → `closeItem` → account closed + rent credited; re-submit same account after close succeeds; `make test` (Surfpool) green
- [ ] Cranker: close-item crank + canon listener/reconciler wiring, unit tests with fixture `Removed` items (dispatch once, dedup, skip-if-unprofitable), `pnpm --filter cranker test` green
- [ ] `programs/canon/SPEC.md` instruction table + state machine updated; bean scope/summary sections updated

### 6. Test Matrix (Given / When / Then)

- Given `Removed` item, When any caller `close_item`, Then account data zeroed + full lamports → caller, `ItemClosed` emitted
- Given item in `Pending`/`Listed`/`WithdrawPending`/`Disputed`, When `close_item`, Then revert `NotRemoved`
- Given `Removed` with nonzero `accumulated_stake` (crafted fixture), When `close_item`, Then revert (defensive)
- Given a closed item PDA, When `submit_item` for the same `account`, Then fresh `CanonItem` at the same PDA, state `Pending`, fresh deposit, `challenge_count == 0`
- Given settled-remove item on Surfpool, When SDK `closeItem`, Then rent credited to caller ATA-less (SOL), account 404s on fetch
- Given N fixture `Removed` items, When cranker reconcile tick + duplicate notification, Then exactly one `close_item` dispatched per item (dedup), none re-dispatched while in-flight

### 7. Open Questions

- Cranker canon wiring: reuse `ProgramAccountListener` generic (parameterize program + discriminator) vs a canon-specific listener — decide in-task; prefer the smaller diff.
- Whether the canon `.qedspec` bootstrap (whole instruction set) lands in the program task here or its own follow-up — implementer's judgment by diff size.
