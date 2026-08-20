---
# accord-ofli
title: Canon — drop dead evidence arg from submit_item (program+SDK+CLI+dApp+e2e+docs)
status: completed
type: milestone
priority: normal
tags:
    - canon
    - breaking-change
created_at: 2026-08-20T17:21:41Z
updated_at: 2026-08-20T18:55:00Z
---

Drop the vestigial `evidence: [u8; 32]` arg from canon `submit_item` end-to-end: program (instruction arg + `ItemSubmitted` event field), LiteSVM tests, Codama codegen, SDK facade, CLI `--evidence` flag, dApp zero-evidence constant, e2e call sites, SPEC + agent-skill docs. Nothing else.

## Why (verified 2026-08-20)

- The arg is written exactly once — `emit!(ItemSubmitted { …, evidence })` (`programs/canon/src/instructions/submit_item.rs:121`). Never stored on `CanonItem`, never read by any instruction, never enters a dispute.
- The documented evidence model is challenger-only: SPEC §Rules & evidence ("the submitter does not file rebuttal evidence", ADR-0004 single filer). The submit-time hash contradicts the SPEC — vestigial from `accord-7tsl`.
- The real evidence path is `challenge_item` → Accord `create_dispute` → `Dispute.evidence_hashes[0]` — UNTOUCHED by this bean.
- Consumers already treat the arg as dead: dApp submits all-zeros (`accord-83sq`), CLI defaults `--evidence` to zeros.

## Design decisions

- **Drop the event field together with the arg.** `ItemSubmitted.evidence` exists only to echo the dead input; keeping it keeps the "what do I put here" question alive for integrators. Event discriminator is name-derived (`sha256("ItemSubmitted")`) — removing a trailing field does not change the discriminator, only the layout. No on-chain consumer decodes this event.
- **Zero migration.** `CanonItem` never stored the hash — no account-layout change, no reopen hazard, no state compat concern.
- **Breaking IDL change accepted.** Instruction-data layout changes (arg count 2 → 1); old serialized transactions/clients break. Fine pre-mainnet; inherent to any arg removal.
- **`challenge_item` / `create_list` untouched** — `evidence_operator` (real key, ECIES target) and challenger evidence flows stay as-is.
- **No canon `.qedspec` exists** (checked — only accord/synod have one), so no formal-verification churn.

## Non-goals

- No change to `challenge_item`, `settle_item`, or any Accord-side evidence surface.
- No two-party/rebuttal evidence extension (stays parked, see `accord-s72c` reference in SPEC).
- No event-consumer/indexer work (none exists).

## Tasks

1. [x] **Program**: `submit_item(ctx, deposit)` — drop arg in `lib.rs:41` dispatcher + `instructions/submit_item.rs:62` handler; drop `evidence` from `emit!` (`submit_item.rs:121`); drop `ItemSubmitted.evidence` field (`src/events.rs:16-17` + doc comment).
2. [x] **LiteSVM**: update 5 files constructing `instruction::SubmitItem { evidence, deposit }` → `{ deposit }`: `submit_item_litesvm.rs` (incl. `do_submit` helper signature), `advance_pending_litesvm.rs:221`, `challenge_item_litesvm.rs:319`, `settle_item_litesvm.rs:219`, `withdrawal_litesvm.rs:209`. Drop now-unused `evidence` locals.
3. [x] **Codegen + SDK**: `anchor build --ignore-keys` → canon codama regen (`cd packages/canon && pnpm exec codama run js`); facade `submitItem(accounts, { evidence, deposit })` → `{ deposit }` (`packages/canon/src/methods.ts:184`); `packages/canon/README.md:64` signature line.
4. [x] **CLI**: `apps/cli/src/commands/canon/submit.ts` — drop `--evidence` flag, `ZERO_EVIDENCE`, the second example, and the now-unused `parseHash32` import.
5. [x] **dApp**: `apps/canon/src/features/item/SubmitItemPage.tsx` — drop the evidence form field, `ZERO_HASH` + `parseHash32` helper, `evidenceHex` state/validation, and the header line (the page had grown a full evidence input past the zero-hash constant the bean was written against).
6. [x] **e2e**: drop `evidence:` from the 6 `submitItem` args objects — `tests/src/canon.spec.ts:181,324,382` + `tests/src/canon.challenge.spec.ts:137,321,407`. Leave all `challengeItem` evidence args alone.
7. [x] **Docs**: `programs/canon/SPEC.md:39` instruction-table row (`submit_item(list, account, deposit = submit_deposit)`); `.agents/skills/useaccord/references/11-canon.md` — `canon:submit` flags/examples + SDK signature line 80. Grep confirms only challenge/operator refs remain.

## HANDOFF

### 1. Flow

1. Submitter (wallet / CLI / dApp) builds `submit_item` with `{ deposit }` only.
2. Program behavior is otherwise identical: ownership gate, deposit transfer + fee-on-transfer delta, `CanonItem` init in `Pending`, `item_count++`.
3. `ItemSubmitted` event now carries `{ list, item, account, submitter, deposit }` — no evidence field.
4. Challenger path unchanged: `challenge_item(item, evidence)` still forwards the hash to Accord `create_dispute`.

### 2. Data Contract

- Program `programs/canon`: `submit_item` args `(deposit: u64)` — `evidence: [u8; 32]` removed. `ItemSubmitted` event fields: `list, item, account, submitter, deposit: u64` — `evidence` removed.
- SDK `@useaccord/canon`: `submitItem(accounts: SubmitItemAccounts, args: { deposit: bigint }, programId?)` → `{ instruction, item }` (return shape unchanged).
- CLI: `useaccord canon:submit --list <pda> --account <addr>` — no `--evidence` flag.
- e2e: `submitItem` args objects lose `evidence`; `challengeItem(accounts, { evidence }, extras)` unchanged.

### 3. Edge Cases & Constraints

- Breaking change to instruction-data layout — any cached/pinned old IDL consumer fails loudly at decode; regenerate, don't hand-patch `generated/`.
- Do NOT touch `challenge_item`'s `evidence` arg, `Dispute.evidence_hashes`, `evidence_operator`, or `@useaccord/sdk/evidence` — the grep in Task 7 must still show those.
- Event discriminator unchanged; only trailing-field layout shrinks — safe for any future log consumer coded against the new IDL.
- `CanonItem` account layout untouched — no space/discriminator implications, existing accounts remain valid.

### 4. Change Sketch

```rust
// lib.rs
pub fn submit_item(ctx: Context<SubmitItem>, deposit: u64) -> Result<()> {
    instructions::submit_item::handler(ctx, deposit)
}

// submit_item.rs — emit only
emit!(ItemSubmitted {
    list: list.key(),
    item: item.key(),
    account: account_key,
    submitter: submitter_key,
    deposit: delta,
});

// events.rs
pub struct ItemSubmitted {
    pub list: Pubkey,
    pub item: Pubkey,
    pub account: Pubkey,
    pub submitter: Pubkey,
    pub deposit: u64,
}
```

```ts
// methods.ts
export async function submitItem(
  accounts: SubmitItemAccounts,
  args: { deposit: bigint },
  programId: Address = CANON_PROGRAM_ID,
) // …
```

### 5. Definition of Done

- [x] `cargo test -p canon --features no-entrypoint` green (47/47, all 5 LiteSVM files updated)
- [x] `anchor build --ignore-keys` emits canon.so; canon codama regen committed (no hand edits in `generated/` — only `submitItem.ts` changed, −9 lines)
- [x] `make codegen` green; every consumer of the changed signature builds (sdk, canon, synod, ui, cli + cli lint, cranker, evidence-daemon, synod-app; `SubmitItemPage.tsx` typechecks). Pre-existing unrelated failures remain at `apps/landing` (`Backdrop` missing from ui) and `apps/app`/`apps/canon` `CreateListPage` (`DomainDocPanel raw` prop) — verified identical on stashed HEAD, none in this change's blast radius.
- [x] `make test` green on Surfpool — 25/25 suites, 108/108 tests; canon.spec + canon.challenge.spec pass with `{ deposit }`-only submits
- [x] Task-7 grep shows zero submit-evidence references outside challenge/operator surfaces; SPEC.md + 11-canon.md + README lines updated
- [x] This bean's summary section updated on completion

### 6. Test Matrix (Given / When / Then)

- Given a list, When `submit_item` with `(deposit)` args only, Then `CanonItem` in `Pending`, `accumulated_stake == deposit`, vault credited, `ItemSubmitted` emitted without evidence field (LiteSVM, existing happy-path assertions minus the arg)
- Given the regenerated SDK, When `submitItem(accounts, { deposit })`, Then instruction encodes and Surfpool accepts it (e2e canon.spec "locks deposit, creates CanonItem in Pending")
- Given a closed item re-submitted via the new signature, Then re-open flow still passes (canon.spec re-submit case)
- Given a challenger on a submitted item, When `challenge_item(item, evidence)`, Then `Dispute.evidence_hashes[0] == evidence` — challenge evidence path regressions caught by existing canon.challenge.spec assertions
- Given stale consumers removed, When `pnpm -r run build`, Then zero references to the old two-arg `submitItem` anywhere in the workspace

### 7. Open Questions

- None — removal is mechanical; no semantic surface changes.

## Summary of Changes

Dropped the vestigial `evidence: [u8; 32]` from canon `submit_item` end-to-end (18 files):

- **Program**: dispatcher + handler now `submit_item(ctx, deposit)`; `ItemSubmitted` event field removed (discriminator unchanged, trailing-field layout only; `CanonItem` layout untouched — no migration).
- **LiteSVM**: all 5 test files + `do_submit` helper signature updated; 47/47 green.
- **SDK**: canon codama regenerated from the new IDL (`generated/instructions/submitItem.ts` only); facade `submitItem(accounts, { deposit })`; README signature lines.
- **CLI**: `--evidence` flag, `ZERO_EVIDENCE`, second example, `parseHash32` import removed; eslint/prettier clean.
- **dApp**: `SubmitItemPage` evidence input field, state, validation, `ZERO_HASH`, local `parseHash32` removed — the page had evolved a full evidence form past the all-zeros constant; `ready` gate and `onSubmit` args now deposit-only.
- **e2e**: 6 `submitItem` call sites deposit-only; all `challengeItem` evidence args and `Dispute.evidence_hashes` assertions untouched and passing.
- **Docs**: SPEC instruction row, `11-canon.md` flag table + example + SDK line.

Verification: `cargo test -p canon --features no-entrypoint` 47/47; `anchor build --ignore-keys`; `make codegen`; consumer builds + `make lint` (only pre-existing `apps/landing` Backdrop failure remains, identical on HEAD); `make test` 25/25 suites / 108/108 tests green on Surfpool.
