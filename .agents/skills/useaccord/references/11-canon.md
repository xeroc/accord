# Canon — Curated-List Arbitrable

Commands under `useaccord canon` drive the Canon program (`can5ZhfgQpi7jymkxE7uEv4ZVm3X2f51KThTUtdWrFs`, ADR `canon/0001`) through `@useaccord/canon`. Canon is an Arbitrable over Accord: it owns the item lifecycle + item deposits; the item's keep-vs-remove disputes run on a 1:1 backing Subaccord that `canon:create-list` CPI-creates.

The `--keypair` wallet is the fee payer AND instruction signer for every command (single-signer model). Every derived address comes from on-chain state — never flags:

- item commands take only `--item`; the list is the item's `list` back-ref
- `fee_mint`, `subaccord`, `challenge_pct`, `submit_deposit`, `dispute_count` are read off the CanonList
- the dispute PDA is `["dispute", list, dispute_count]` (the CanonList PDA is the filer — the nonce is the LIST counter, not the item's)
- settle/withdrawal payees (`activeDispute`, `challenger`, `submitter`) are read off the CanonItem — payouts cannot be redirected

Item lifecycle: `Pending → (advance_pending | challenge) → Listed/Disputed → … → Removed`.

## `canon:create-list`

Permissionless. Inits CanonList `["canon", creator, rules_hash]` and CPIs Accord `create_subaccord` (`domain_ref := rules_hash`). `rules_hash` + `list_program` are immutable; the economics are frozen at creation.

| Flag | Type | Notes |
|---|---|---|
| `--rules-hash <hex>` | 32-byte hex | Listing-criteria doc hash; `≠ [0;32]`. Omit with `--random-rules-hash` |
| `--random-rules-hash` | flag | Mints a fresh hash ⇒ unique PDA (dev) |
| `--stake-mint <mint>` | address | Juror collateral mint (backing Subaccord `staking_token`) |
| `--fee-mint <mint>` | address | Registry economics mint (deposits, bounties, Accord fees); may equal `--stake-mint` |
| `--list-program <program>` | address | Must own a curated `account` at submit. Default: sentinel `1111…1111` ⇒ ownership gate OFF |
| `--submit-deposit <units>` | u64 | Permanent skin locked at submit, base units of `fee_mint` |
| `--challenge-pct <bps>` | u16 | Challenger stake as bps of `accumulated_stake`; `≤ 10_000` |
| `--listing-window <secs>` | u64 | Pending → Listed auto-promotion window |
| `--withdrawal-timelock <secs>` | u64 | WithdrawPending challenge window |
| `--evidence-operator <addr>` | address | Backing court's Ed25519 operator; `≠ Pubkey::default()` (on-chain guard) |
| `--min-stake <units>` | u64 | Court: juror draw threshold (stake-mint units). Default: canonical profile |
| `--alpha-bps <bps>` | u16 | Court: slash factor; `≤ 10_000`. Default 1000 |
| `--review-window <secs>` | u64 | Court: round review window; `> 0`. Default 7d |
| `--commit-window <secs>` | u64 | Court: juror commit window; `> 0`. Default 2d |
| `--reveal-window <secs>` | u64 | Court: juror reveal window; `> 0`. Default 2d |
| `--appeal-window <secs>` | u64 | Court: appeal window; Accord floor 1h. Default 3d |
| `--max-appeals <n>` | u8 | Court: appeal cap; ladder `(J+1)·2^k − 1 ≤ MAX_JURORS`. Default 3 |
| `--min-jury-size <n>` | u32 | Court: round-1 panel size; odd; **immutable**. Default 3 |
| `--fee-per-juror <units>` | u64 | Court: per-juror fee (fee-mint units). Default 10 |
| `--reveal-threshold-bps <bps>` | u16 | Court: reveal quorum (ADR-0021); `≤ 10_000`. Default 6666 |
| `--max-draw-attempts <n>` | u8 | Court: same-size redraw cap (ADR-0021). Default 3 |
| `--depth <n>` | u8 | Court: MST accumulator depth; `≤ 8`; **immutable**. Default 8 |

Court flags override the SDK canonical profile (`defaultCourtParams()` — ADR `canon/0002`); unset flags keep the canonical value. Validation is on-chain (`AlphaTooHigh` / `WindowTooShort` / `TreeDepthTooDeep` + Accord CPI guards).

```bash
useaccord canon:create-list --random-rules-hash \
  --stake-mint EPjFW…e4U --fee-mint EPjFW…e4U \
  --submit-deposit 500 --challenge-pct 5000 \
  --listing-window 432000 --withdrawal-timelock 432000 \
  --evidence-operator 9a1K…mQp
# → { signature, list, subaccord }
```

```bash
useaccord canon:create-list --random-rules-hash \
  --stake-mint EPjFW…e4U --fee-mint EPjFW…e4U \
  --submit-deposit 500 --challenge-pct 5000 \
  --listing-window 432000 --withdrawal-timelock 432000 \
  --evidence-operator 9a1K…mQp \
  --min-jury-size 5 --fee-per-juror 25  # court override; rest canonical
```

SDK: `createList(accounts, args)` → `{ instruction, list, subaccord }`.

## `canon:update`

Authority-gated instant retune of list-level economics (the loaded wallet must be `CanonList.authority` — the creator at creation). No timelock: deposits lock per-item at submit, `challenge_pct` applies at the next challenge, windows gate future crank advances. Omitted flags keep their on-chain value (the CLI fetches the list and passes the current value through).

| Flag | Type | Notes |
|---|---|---|
| `--list <pda>` | address | CanonList PDA to retune |
| `--submit-deposit <units>` | u64 | New permanent submit skin; `> 0`. Default: keep current |
| `--challenge-pct <bps>` | u16 | Challenger stake fraction; `≤ 10_000`. Default: keep current |
| `--listing-window <secs>` | u64 | `> 0`. Default: keep current |
| `--withdrawal-timelock <secs>` | u64 | `> 0`. Default: keep current |
| `--new-authority <pubkey>` | address | Rotates the governance key. Default: keep current |

```bash
useaccord canon:update --list can5Z… --challenge-pct 2500
# → { signature, list }
```

SDK: `updateList(accounts, args)` → `Instruction` (`newAuthority` omitted ⇒ no rotation).

## `canon:court-update`

Authority-gated proposal to retune the list's **backing-court** params — CPIs Accord `propose_subaccord_update` with the CanonList PDA as court authority; the loaded wallet must be the list authority and pays the `PendingUpdate` rent. Arms the 48h Accord timelock (`UPDATE_TIMELOCK_SLOTS`); land it afterwards with `useaccord lifecycle:execute-update` (permissionless — no canon wrapper; needs `--pending-update <pda>` or the subaccord+nonce).

| Flag | Type | Notes |
|---|---|---|
| `--list <pda>` | address | CanonList PDA; the backing Subaccord is read off it |
| `--nonce <n>` | u64 | Update nonce; increments per proposal. Default 0 |
| `--payload <Kind:value>` | token | One mutable court field — e.g. `MinStake:2000`, `AlphaBps:1500`, `ReviewWindow:86400`, `FeePerJuror:25`, `RevealThresholdBps:8000`, `MaxDrawAttempts:2`, `EvidenceOperator:<addr>` |

Forbidden payloads: `Authority` (the court authority is pinned to the list PDA — rotating it would strand retuning), `min_jury_size` / `depth` (immutable on the Subaccord). Guards: `AlphaBps ≤ 10_000`, review/commit/reveal windows `> 0` (canon mirrors), everything else rides Accord.

```bash
useaccord canon:court-update --list can5Z… --payload AlphaBps:1500
# → { signature, list, subaccord, pendingUpdate, executeAfterSlot }
useaccord lifecycle:execute-update --subaccord <pda> --nonce 0   # after executeAfterSlot
```

SDK: `proposeCourtUpdate(accounts, { nonce, payload })` → `{ instruction, pendingUpdate }` (`pendingUpdate` PDA is on the Accord program).

## `canon:submit`

Submit `--account` for curation. Inits CanonItem `["canon-item", list, account]` in `Pending`, locks the list's `submit_deposit` from the submitter into the list vault. No `--deposit` flag — the on-chain gate demands an exact match (`DepositMismatch`), so the CLI reads it off the list.

| Flag | Type | Notes |
|---|---|---|
| `--list <pda>` | address | CanonList PDA |
| `--account <addr>` | address | The curated address (PDA owned by `list_program`; any address on a sentinel list) |

```bash
useaccord canon:submit --list can5Z… --account Fg6Pa…7r4t
# → { signature, item, deposit }
```

SDK: `submitItem(accounts, { deposit })` → `{ instruction, item }`.

## `canon:challenge`

Challenge an item to an Accord keep-vs-remove dispute. CPIs `create_dispute` with the CanonList PDA as filer; the loaded wallet (challenger) locks `challenge_pct × accumulated_stake` plus the panel fee into the list vault. Only flag: `--item <pda>` (+ optional `--evidence <hex>`).

After the ruling is Final, crank `canon:settle` to fold it back: `keep` ⇒ forfeited stake folds into `accumulated_stake` (progressive protection); `remove` ⇒ challenger takes the pot.

SDK: `challengeItem(accounts, { evidence }, extras)` — the four Accord CPI accounts (`accordDispute`, `accordState`, `accordFeeVault`, `accordProgram`) ride `remaining_accounts`.

## Cranks + withdrawal

| Command | When it lands | Effect |
|---|---|---|
| `canon:advance-pending --item` | `listing_window` elapsed, unchallenged | Pending → Listed |
| `canon:settle --item` | item's dispute is Final | folds ruling (keep/remove) into the item |
| `canon:request-withdrawal --item` | submitter-signed, item Listed | → WithdrawPending (opens the fraud-challenge window) |
| `canon:advance-withdrawal --item` | `withdrawal_timelock` elapsed, unchallenged | returns `accumulated_stake` to the submitter; item → Removed |
| `canon:close-item --item` | item is Removed | closes the PDA; caller reclaims rent |

All permissionless except `request-withdrawal` (submitter-only). All take only `--item`.

## Reads

| Command | SDK fn | Notes |
|---|---|---|
| `canon:list <addr>` | `fetchMaybeCanonList` | Missing ⇒ `{exists:false}`, exit 0. Appends a `gate:` line naming the ownership mode |
| `canon:item <addr>` | `fetchMaybeCanonItem` | Appends a `state:` line naming the lifecycle stage |
| `canon:lists` | `findAllCanonLists` | Every list (discriminator-filtered `getProgramAccounts`) |
| `canon:items` | `findAllCanonItems` | Every item; filter client-side by `.data.list` or `.data.state` with `jq` (see below) |

```bash
useaccord canon:item 6kVU…9pQm --json
useaccord canon:items --json | jq '.[] | select(.data.state == 4)'   # Disputed
```

See: `programs/canon/SPEC.md`, ADR `canon/0001`, `packages/canon/src/methods.ts`.
