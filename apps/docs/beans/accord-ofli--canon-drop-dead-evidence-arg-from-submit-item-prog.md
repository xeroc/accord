---
# accord-ofli
title: Canon — drop dead evidence arg from submit_item (program+SDK+CLI+dApp+e2e+docs)
status: todo
type: milestone
priority: normal
tags:
    - canon
    - breaking-change
created_at: 2026-08-20T17:21:41Z
updated_at: 2026-08-20T17:21:41Z
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

1. [ ] **Program**: `submit_item(ctx, deposit)` — drop arg in `lib.rs:41` dispatcher + `instructions/submit_item.rs:62` handler; drop `evidence` from `emit!` (`submit_item.rs:121`); drop `ItemSubmitted.evidence` field (`src/events.rs:16-17` + doc comment).
2. [ ] **LiteSVM**: update 5 files constructing `instruction::SubmitItem { evidence, deposit }` → `{ deposit }`: `submit_item_litesvm.rs` (incl. `do_submit` helper signature), `advance_pending_litesvm.rs:221`, `challenge_item_litesvm.rs:319`, `settle_item_litesvm.rs:219`, `withdrawal_litesvm.rs:209`. Drop now-unused `evidence` locals.
3. [ ] **Codegen + SDK**: `anchor build --ignore-keys` → canon codama regen (`cd packages/canon && pnpm exec codama run js`); facade `submitItem(accounts, { evidence, deposit })` → `{ deposit }` (`packages/canon/src/methods.ts:184`); `packages/canon/README.md:64` signature line.
4. [ ] **CLI**: `apps/cli/src/commands/canon/submit.ts` — drop `--evidence` flag, `ZERO_EVIDENCE`, the second example, and the now-unused `parseHash32` import.
5. [ ] **dApp**: `apps/canon/src/features/item/SubmitItemPage.tsx` — drop `ZERO_EVIDENCE` + stale header comment lines about the zero-hash contract.
6. [ ] **e2e**: drop `evidence:` from the 6 `submitItem` args objects — `tests/src/canon.spec.ts:181,324,382` + `tests/src/canon.challenge.spec.ts:137,321,407`. Leave all `challengeItem` evidence args alone.
7. [ ] **Docs**: `programs/canon/SPEC.md:39` instruction-table row (`submit_item(list, account, deposit = submit_deposit)`); `.agents/skills/useaccord/references/11-canon.md` — `canon:submit` flags/examples + SDK signature line 80. Grep `grep -rn "evidence" programs/canon packages/canon apps/cli/src/commands/canon apps/canon tests/src/canon*.spec.ts .agents/skills/useaccord/references/11-canon.md` to confirm only challenge/operator refs remain.

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

- [ ] `cargo test -p canon --features no-entrypoint` green (all 5 LiteSVM files updated)
- [ ] `anchor build --ignore-keys` emits canon.so; canon codama regen committed (no hand edits in `generated/`)
- [ ] `make codegen && pnpm -r run build` green workspace-wide (catches every TS consumer)
- [ ] `make test` green on Surfpool — canon.spec + canon.challenge.spec pass with `{ deposit }`-only submits
- [ ] Task-7 grep shows zero submit-evidence references outside challenge/operator surfaces; SPEC.md + 11-canon.md + README lines updated
- [ ] This bean's summary section updated on completion

### 6. Test Matrix (Given / When / Then)

- Given a list, When `submit_item` with `(deposit)` args only, Then `CanonItem` in `Pending`, `accumulated_stake == deposit`, vault credited, `ItemSubmitted` emitted without evidence field (LiteSVM, existing happy-path assertions minus the arg)
- Given the regenerated SDK, When `submitItem(accounts, { deposit })`, Then instruction encodes and Surfpool accepts it (e2e canon.spec "locks deposit, creates CanonItem in Pending")
- Given a closed item re-submitted via the new signature, Then re-open flow still passes (canon.spec re-submit case)
- Given a challenger on a submitted item, When `challenge_item(item, evidence)`, Then `Dispute.evidence_hashes[0] == evidence` — challenge evidence path regressions caught by existing canon.challenge.spec assertions
- Given stale consumers removed, When `pnpm -r run build`, Then zero references to the old two-arg `submitItem` anywhere in the workspace

### 7. Open Questions

- None — removal is mechanical; no semantic surface changes.
