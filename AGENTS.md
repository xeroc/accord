# AGENTS.md

> **Status: greenfield scaffold.** The monorepo structure, tooling, and command
> set below are the _target_. The `accord` program is a stub crate with no
> instructions; build/test commands resolve once the first feature lands (TDD).
> The design docs and ADRs are the authority on _what_ to build; this file is the
> authority on _how_ to build and verify it.

## Project Overview

**VeriDAO Accord** is a general-purpose, Schelling-point arbitration primitive on
Solana (Anchor). Any program (the _Arbitrable_) files a Dispute via CPI; the Accord
draws stake-weighted Jurors (Switchboard VRF), collects commit-reveal votes, and
emits a Ruling the filer reads lazily. It is a standalone, reusable product.

The name fuses _veritas_ + _DAO_. The Schelling Point here is **honesty** — Jurors
vote truthfully because coherent-with-majority is the profitable strategy.

## Repository Layout

```
programs/
  accord/            VeriDAO Accord — Schelling-point arbitration
packages/
  sdk/              @veridao/sdk — TypeScript SDK (IDL clients, PDA helpers, CPI wrappers)
tests/              @veridao/tests — jest integration suite (runs vs test-validator / Surfpool)
apps/               User-facing applications (web/landing/docs) — land per build phase
docs/adr/           Architecture Decision Records (numbered, immutable-once-deployed)
CONTEXT.md          Accord domain language (glossary)
PROJECT.md          Accord rationale
Cargo.toml          Rust workspace
Anchor.toml         Anchor workspace + provider + test script
Makefile            Build/test orchestration (root package.json has NO scripts by design)
pnpm-workspace.yaml TS workspace globs (apps/*, packages/*, tests)
tsconfig.base.json  Shared TS compiler options
rust-toolchain.toml Host rust (Solana BPF SDK bundles its own)
```

> **Reading order for new agents:** `CONTEXT.md` (domain language) → `AGENTS.md`
> (this file — build/test, conventions, gotchas) → `docs/adr/` (the _why_ behind
> every locked architectural decision). ADRs are authority on rationale; code is
> authority on current state.

## Build / Test Commands

> The root `package.json` has no `scripts` block by design — the Makefile
> orchestrates builds, and lint/test fan out via pnpm's recursive filter.
> Don't add root scripts; they'd duplicate the Makefile.

- `make prep` — install Solana (v1.18.20) + Anchor (0.31.0) via avm, then `pnpm install`
- `make build` — `anchor build` (programs) then `pnpm -r run build` (packages/apps)
- `make lint` — `pnpm -r run lint` across every workspace that declares a lint script
- `pnpm --filter <pkg> run lint:fix` — auto-fix lint in one package (not all packages define `lint:fix`)
- `anchor test` — Rust unit tests + the `tests/` jest suite against a local validator
- `make run_surfpool` — start a Surfpool local fork (separate terminal)
- `make test_surfpool` — full suite (Rust + jest) against a running Surfpool instance
- `cd tests && npx jest` — run only the `tests/` TypeScript integration suite (needs Surfpool: `make run_surfpool`)
- `cd tests && npx jest -t "<name>"` — run a single test by name
- `cd packages/sdk && pnpm run build` — build the SDK
- `cd programs/accord && cargo test` — Rust unit tests for the Accord in isolation

## Code Style

### TypeScript

- Strict types; avoid `any` except for Anchor wallet compatibility.
- Import order: `@solana/*` → `@coral-xyz/anchor` → local modules.
- camelCase for variables/functions, PascalCase for types/classes.
- `PublicKey` for all addresses, `anchor.BN` for all numbers.
- Prefer `accountsStrict()` over `accounts()` for type safety.
- File naming: camelCase, mirror source structure, `.test.ts` / `.spec.ts` suffix.
- Format with Prettier; run `pnpm --filter <pkg> run lint:fix` before commits where defined.

### Rust

- snake_case for files/identifiers, PascalCase for types/structs/enums.
- Return `Result<()>` from instructions; propagate errors via `#[error_code]` enums.
- One account-validation struct per instruction (`#[derive(Accounts)]`); keep `#[program]` thin.
- Use PDAs consistently; derive via helper fns in the SDK (`packages/sdk/src/pda.ts`).
- Prefer `init`/`init_if_needed` with `seeds` + `bump` over manual PDA writes.

## Testing Instructions

- **TDD only.** RED → GREEN → REFACTOR for every feature/instruction. Write the
  failing test first, then implement to pass. No exceptions.
- Integration tests live in `tests/` (jest, run against a live validator).
- Rust unit tests live inline (`#[cfg(test)]`) in the program crate.
- First real test ships with the first Accord instruction (`create_subaccord`).
- Run `make lint` and the relevant test before committing. A milestone is
  `completed` only when all its leaf tests are green.

## Accord (Program B — built first)

Standalone Schelling-point arbitration primitive. v1 instruction set target:

```
create_subaccord(params, authority, evidence_operator)    — permissionless Subaccord
propose/execute_subaccord_update                          — authority-gated, 48h on-chain timelock
stake(amount) / unstake(amount)                           — Juror capital; unstake blocked while active_draws > 0
create_dispute(subaccord, options, evidence_hash, fee)    — [Arbitrable CPI]; filer pays full fee
post_snapshot(dispute, merkle_root)                       — off-chain indexer; 1× bond; 1-day challenge window
challenge_snapshot(dispute, fraud_proof)                  — contest a wrong root within the window
draw(dispute, vrf, memberships[])                         — Switchboard VRF; N distinct Jurors over the Snapshot
commit / reveal                                           — hash(vote, salt, juror_pubkey) then {vote, salt}
appeal(dispute)                                           — permissionless; 2N+1; bond forfeited if no flip
finalize_round / finalize_dispute                         — permissionless crank; redistribution + active_draws--
get_ruling(dispute)                                       — lazy read by the Arbitrable
pause() / unpause()                                       — multisig circuit-breaker
```

Authority: `PROJECT.md`, `programs/accord/SPEC.md`, `docs/adr/0001` (Schelling), `0002` (per-Subaccord staking token, no token v1), `0003` (draw), `0004` (party-agnostic), `0005` (Subaccord authority), `0006` (evidence), `0007` (upgrade).

## Build Order

1. **VeriDAO Accord** — standalone arbitration. The focus of this repo.
2. **v2** — Arcium encrypted vote-tally (Juror vote privacy), accord token, tranched staking.
3. **v3** — futarchy governance, evidence markets, AI risk pricing, ZK proofs.

## v1 Defaults (configurable per Subaccord)

| Parameter            | Default               | Notes                                 |
| -------------------- | --------------------- | ------------------------------------- |
| Jurors per dispute   | 3                     | Per Subaccord                         |
| Review window        | 7 days                | Jurors assess evidence                |
| Commit window        | 2 days                | `hash(vote, salt)`                    |
| Reveal window        | 2 days                | `{vote, salt}`                        |
| Alpha (slash factor) | 10%                   | Incoherent juror stake lost           |
| Min juror stake      | 1,000 (staking_token) | Draw eligibility; per-Subaccord token |
| Max appeals          | 3                     | 3 → 7 → 15 → 31 jurors                |

## Beans

**IMPORTANT:** before doing anything else, run `beans prime` and `hordr prime`
and heed the output. Include relevant bean IDs in commit messages. Config lives
in `.beans.yml` (prefix `VeriDAO-`).

### Bean hygiene

1. **Check before creating.** Run `beans list --json`; scan for existing beans
   covering the same scope. Duplicates waste context. If a new bean subsumes an
   old one, scrap the old with a `## Reasons for Scrapping` section.
2. **Restructuring.** When a grilling changes scope, append a
   `## REWRITTEN SCOPE (date — supersedes content above)` section. Update titles
   via GraphQL (CLI has no `--title` flag). Don't scrap beans that have
   accumulated context — rewrite in place.
3. **Design decisions → milestone body.** Capture grilling resolutions as a
   "Design decisions" section (struct layouts, flow diagrams, rationale). Leaf
   tasks carry the TDD acceptance criteria.
4. **Program changes ⇒ update the program's `.qedspec`.** When the Accord gains
   instructions, create/update `programs/accord/accord.qedspec` and regenerate
   the formal-verification directory. (No qedspec exists yet — add with the
   first non-trivial instruction set.)
5. **Status flows up.** A milestone is `completed` only when all leaf tasks are
   `completed`; epics close when all features close.
6. **Active milestones may supersede code state.** Always check
   `beans list --json --ready` for in-flight work before assuming docs reflect
   reality.

## Gotchas

- **Program IDs are placeholders.** `declare_id!` in the program and the
  `[programs.*]` entries in `Anchor.toml` use the system-program placeholder.
  First `anchor build` provisions a real keypair in `target/deploy/accord.json`.
- **Per-Subaccord staking token.** Each Subaccord defines its `staking_token` at
  creation (ADR-0002); USDC is the common default, not hard-coded.
