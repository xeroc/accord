# AGENTS.md

> **Status: greenfield scaffold.** The monorepo structure, tooling, and command
> set below are the _target_. Both programs (`court`, `mutual`) are currently
> stub crates with no instructions; build/test commands resolve once the first
> feature lands (TDD). The design docs and ADRs are the authority on _what_ to
> build; this file is the authority on _how_ to build and verify it.

## Project Overview

**VeriDAO** is a Solana platform of two Anchor programs:

| Program    | Crate             | Role                                                                                                                                                                                                                   | Ships   |
| ---------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **Court**  | `programs/court`  | General-purpose Schelling-point arbitration court. Any program files a Dispute via the Arbitrable CPI interface; the Court draws stake-weighted Jurors (Switchboard VRF), collects commit-reveal votes, emits Rulings. | **1st** |
| **Mutual** | `programs/mutual` | Factory of single-purpose discretionary mutuals. Client of the Court: files Claims as Disputes, reads Rulings, pays/denies. Two-tier funds, tenure-based coverage, Settlement crank.                                   | **2nd** |

The name fuses _veritas_ + _DAO_. The Schelling Point here is **honesty** — Jurors
vote truthfully because coherent-with-majority is the profitable strategy.

## Repository Layout

```
programs/
  court/            VeriDAO Court — Schelling-point arbitration (program B, built 1st)
  mutual/           VeriDAO Mutual — single-purpose mutual factory (program A, built 2nd)
packages/
  sdk/              @veridao/sdk — TypeScript SDK (IDL clients, PDA helpers, CPI wrappers)
tests/              @veridao/tests — jest integration suite (runs vs test-validator / Surfpool)
apps/               User-facing applications (web/landing/docs) — land per build phase
docs/adr/           Architecture Decision Records (numbered, immutable-once-deployed)
CONTEXT.md          Domain language / ubiquitous language (both contexts)
PROJECT.md          Court rationale (program B)
MUTUAL.md           Mutual rationale (program A)
CONTEXT-MAP.md      How the two programs relate (Court ← CPI ← Mutual)
context/            Design grilling output + research (design-decisions.md, grilling-beans.md, …)
Cargo.toml          Rust workspace (members = programs/*)
Anchor.toml         Anchor workspace + provider + test script
Makefile            Build/test orchestration (root package.json has NO scripts by design)
pnpm-workspace.yaml TS workspace globs (apps/*, packages/*, tests)
tsconfig.base.json  Shared TS compiler options
rust-toolchain.toml Host rust (Solana BPF SDK bundles its own)
```

> **Reading order for new agents:** `CONTEXT.md` (domain language) →
> `CONTEXT-MAP.md` (how Court & Mutual relate) → `AGENTS.md` (this file —
> build/test, conventions, gotchas) → `docs/adr/` (the _why_ behind every
> locked architectural decision). ADRs are authority on rationale; code is
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
- `cd programs/court && cargo test` — Rust unit tests for the Court in isolation

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
- Rust unit tests live inline (`#[cfg(test)]`) in the program crates.
- First real test ships with the first Court instruction (`create_subcourt`).
- Run `make lint` and the relevant test before committing. A milestone is
  `completed` only when all its leaf tests are green.

## Court (Program B — built first)

Standalone Schelling-point arbitration primitive. v1 instruction set target:

```
create_subcourt(staking_token, min_stake, review/commit/reveal windows, alpha)
stake(amount) / unstake(amount)        — juror capital into a Subcourt
create_dispute(subcourt, options, evidence_hash, fee) → dispute_id   [Arbitrable CPI]
draw(dispute_id)                        — random stake-weighted via Switchboard VRF
commit(dispute_id, hash(vote, salt))    — secret
reveal(dispute_id, vote, salt)          — after all commits
appeal(dispute_id)                      — 2N+1 jurors; loser posts appeal bond
execute_ruling(dispute_id)              — writes winning option; lazy-read by filer
```

Authority: `PROJECT.md`, `docs/adr/0002` (Schelling court), `docs/adr/0005` (USDC stake, no court token in v1).

## Mutual (Program A — built second)

Factory of single-purpose discretionary mutuals; client of the Court. v1 instruction set target:

```
create_mutual(risk_type, evidence_spec[immutable], terms, subcourt, capital config)
stake(amount) / request_withdraw()      — Staker capital → Reserve Fund
pay_premium()                           — recurring Premium → Premium Fund (rail TBD, BEAN-5)
file_claim(...)                         — Insured claim → Court Dispute via CPI
settle_claim(dispute_id)                — read Court Ruling; pay (Premium→Reserve) or deny
settle_period()                         — permissionless crank: surplus split, yield, withdrawals
```

Capital model: Premium Fund (first-loss, resets each Settlement) over Reserve Fund
(Staker backstop; drawing it slashes all Staker Positions pro-rata). MCR gate
blocks new Policies when `Reserve < total_active_coverage × mcr_factor`.

Authority: `MUTUAL.md`, `docs/adr/0003` (consumed premium), `docs/adr/0004` (single-purpose), `docs/adr/0006` (premium lazy reads).

## Build Order

1. **VeriDAO Court** — standalone arbitration. Ships first, its own product.
2. **VeriDAO Mutual** — factory; plugs into the Court via Arbitrable CPI.
3. **v2** — dynamic premium, tranched staking, position transferability, Arcium MPC evidence, court token.
4. **v3** — futarchy governance, evidence markets, AI risk pricing, ZK proofs, licensed captive structures.

## v1 Defaults (configurable per Mutual / Subcourt)

| Parameter            | Default    | Notes                          |
| -------------------- | ---------- | ------------------------------ |
| Jurors per dispute   | 3          | Per Subcourt                   |
| Review window        | 7 days     | Jurors assess evidence         |
| Commit window        | 2 days     | `hash(vote, salt)`             |
| Reveal window        | 2 days     | `{vote, salt}`                 |
| Alpha (slash factor) | 10%        | Incoherent juror stake lost    |
| Min juror stake      | 1,000 USDC | Draw eligibility               |
| Max appeals          | 3          | 3 → 7 → 15 → 31 jurors         |
| Waiting period       | 1 payment  | Before coverage activates      |
| Grace period         | 7 days     | Missed-payment tolerance       |
| Reinstatement wait   | 14 days    | No-claims after lapse          |
| Staker lockup min    | 90 days    | Independent of period_length   |
| MCR factor           | 30%        | Reserve / total coverage floor |
| Platform fee         | 1%         | Of premium flow (BEAN-7, TBD)  |

## Open Design Decisions (do not assume these are resolved)

Tracked in `context/grilling-beans.md`. The active ones that touch program design:

- **BEAN-5 — Premium payment rail** is undecided. The Mutual's coverage-status
  logic is rail-agnostic (needs a "is this Insured current?" signal + payment
  count); do not hard-code a payment mechanism. `docs/adr/0006`.
- **BEAN-6 — Evidence encryption primitive.** v1 may use simple off-chain key
  management; Arcium MPC is a v2 upgrade. The commitment hash is always on-chain.
- **BEAN-2/3/4 — Legal posture** (substance-over-form, health data, AML/KYC).
  May force per-Mutual `kyc_required` flags; needs counsel before launch.

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
4. **Program changes ⇒ update the program's `.qedspec`.** When the Court/Mutual
   gain instructions, create/update `programs/<name>/<name>.qedspec` and
   regenerate the formal-verification directory. (No qedspec exists yet — add
   with the first non-trivial instruction set.)
5. **Status flows up.** A milestone is `completed` only when all leaf tasks are
   `completed`; epics close when all features close.
6. **Active milestones may supersede code state.** Always check
   `beans list --json --ready` for in-flight work before assuming docs reflect
   reality.

## Gotchas

- **Court is deployed before Mutual.** The Mutual crate's `court` CPI import
  (`programs/mutual/Cargo.toml`) stays commented out until the Court IDL is
  generated by `anchor build`.
- **Program IDs are placeholders.** `declare_id!` in both programs and the
  `[programs.*]` entries in `Anchor.toml` use the system-program placeholder.
  First `anchor build` provisions real keypairs in `target/deploy/*.json`.
- **Premium rail is undefined.** Don't build payment mechanics until BEAN-5
  resolves; design coverage-status as a lazy read.
- **"Mutual", never "insurance".** It is a discretionary mutual — no binding
  indemnity, no insurance license. See `CONTEXT.md` § Why "Mutual".
