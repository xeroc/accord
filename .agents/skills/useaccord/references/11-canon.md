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

```bash
useaccord canon:create-list --random-rules-hash \
  --stake-mint EPjFW…e4U --fee-mint EPjFW…e4U \
  --submit-deposit 500 --challenge-pct 5000 \
  --listing-window 432000 --withdrawal-timelock 432000 \
  --evidence-operator 9a1K…mQp
# → { signature, list, subaccord }
```

SDK: `createList(accounts, args)` → `{ instruction, list, subaccord }`.

## `canon:submit`

Submit `--account` for curation. Inits CanonItem `["canon-item", list, account]` in `Pending`, locks the list's `submit_deposit` from the submitter into the list vault. No `--deposit` flag — the on-chain gate demands an exact match (`DepositMismatch`), so the CLI reads it off the list.

| Flag | Type | Notes |
|---|---|---|
| `--list <pda>` | address | CanonList PDA |
| `--account <addr>` | address | The curated address (PDA owned by `list_program`; any address on a sentinel list) |
| `--evidence <hex>` | 32-byte hex | Evidence commitment. Default: 32 zero bytes |

```bash
useaccord canon:submit --list can5Z… --account Fg6Pa…7r4t
# → { signature, item, deposit }
```

SDK: `submitItem(accounts, { evidence, deposit })` → `{ instruction, item }`.

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
