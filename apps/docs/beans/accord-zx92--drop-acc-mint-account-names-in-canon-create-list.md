---
# accord-zx92
title: Drop _acc mint account names in canon create_list
status: completed
type: task
priority: normal
created_at: 2026-08-14T16:54:40Z
updated_at: 2026-08-14T17:04:56Z
---

Rename stake_mint_acc/fee_mint_acc -> stake_mint/fee_mint in CreateList accounts struct. The flat codama input collides with the existing stake_mint/fee_mint instruction args (duplicate TS keys), and nothing tied arg==account, so the redundant args are removed and the handler uses ctx.accounts.stake_mint.key(). Ripples: lib.rs signature, state.rs #[instruction], create_list.rs, LiteSVM test, IDL+codegen, packages/canon facade. Facade public API unchanged.

## Summary of Changes

- Renamed CreateList accounts `stake_mint_acc`/`fee_mint_acc` -> `stake_mint`/`fee_mint` (programs/canon/src/state.rs); a plain rename would collide with the like-named instruction args in the flat codama input (duplicate `stakeMint` TS keys), so the redundant `stake_mint`/`fee_mint` instruction args were removed and the handler now sources both from `ctx.accounts.<mint>.key()` (lib.rs, instructions/create_list.rs). This also closes the arg!=account drift hole — the stored `CanonList.stake_mint`/`fee_mint` and the CPI-forwarded mints are now the same validated Mint account by construction.
- LiteSVM: do_create_list returns the created mints; happy path now asserts list.stake_mint/fee_mint and sub.staking_token/fee_token equal them (4/4 green).
- IDL regenerated (anchor build --ignore-keys) + codama client (`pnpm --filter @useaccord/canon run codegen`); facade methods.ts literal merged to single stakeMint/feeMint keys. Facade public API unchanged — zero consumer churn (apps/canon, tests/src build untouched).
- Docs: SPEC.md instruction row 1 now matches the real signature (also fixed pre-existing domain_ref/rules_hash drift); packages/canon/README.md createList facade documented (was claiming not-yet-shipped). Anchor.toml [programs] canon entry auto-synced by anchor to declare_id (was stale).
- Verified: cargo test -p canon --features no-entrypoint green; make test green (17/17 jest suites incl. canon.spec + canon.challenge.spec over the new wire format; 64 passed, 1 pre-existing evidence-daemon env skip); pnpm -r build + lint clean.
