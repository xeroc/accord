# AGENTS.md

> **Status: greenfield scaffold.** The monorepo structure, tooling, and command
> set below are the _target_. The `accord` program is a stub crate with no
> instructions; build/test commands resolve once the first feature lands (TDD).
> The design docs and ADRs are the authority on _what_ to build; this file is the
> authority on _how_ to build and verify it.

## Project Overview

**Accord** is a general-purpose, Schelling-point arbitration primitive on
Solana (Anchor). Any program (the _Arbitrable_) files a Dispute via CPI; the Accord
draws stake-weighted Jurors (VRF), collects commit-reveal votes, and
emits a Ruling the filer reads lazily. It is a standalone, reusable product.

The name means _agreement, harmony_ — what the Schelling Point produces. The
Schelling Point here is **honesty** — Jurors vote truthfully because coherent-with-majority is the profitable strategy.

## Repository Layout

```
programs/
  accord/            Accord — Schelling-point arbitration
packages/
  sdk/              @useaccord/sdk — TypeScript SDK (IDL clients, PDA helpers, CPI wrappers); @useaccord/sdk/evidence — shared evidence crypto protocol (ADR-0015)
tests/              @useaccord/tests — jest integration suite (runs vs test-validator / Surfpool)
apps/               User-facing applications (web/landing/docs) — land per build phase
apps/docs/          MkDocs documentation site (developer-facing)
apps/docs/adr/ Architecture Decision Records (numbered, immutable-once-deployed)
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
> (this file — build/test, conventions, gotchas) → `apps/docs/adr/` (the _why_ behind
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
- `make test_unit` — LiteSVM Rust unit/TDD tests (fast, no validator): builds the `.so` then runs `cargo test --features no-entrypoint` in `programs/accord`
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

## Documentation

- **Docs match reality, always.** Code comments, doc-comments, `SPEC.md`,
  `security-checklist.md`, ADRs, and bean scope/summary sections must describe
  the code as it _is_ — not as it was planned, renamed-away, or "will be." A
  doc that narrates behavior the code doesn't have (e.g. "the tally dispatches
  off X" when it doesn't, or a struct field listed in an account table that no
  longer exists) is a bug: fix the doc or fix the code in the same change,
  never leave them diverged.
- **Forward-looking comments must be true today.** "Future variants ship as…"
  is allowed only if the described seam already exists in code (field present,
  dispatch wired). Otherwise mark it `// TODO` / "not yet implemented" or omit
  it — aspirational prose rots into lies silently.
- **Renames/drops are doc changes too.** When you rename or remove a field,
  instruction, or error, grep the whole docs surface (`SPEC.md`,
  `security-checklist.md`, `apps/docs/`, `README.md`, beans, ADRs) and update
  every reference in the same change. The MkDocs site (`apps/docs/docs/`) and
  `README.md` are part of this surface — stale names there are reality-mismatches.
- **When behavior and docs disagree, trust the code — then reconcile.** Don't
  bend a test to match a stale doc; don't rewrite a doc to match a bug. Decide
  which is correct, fix the wrong one, update the other.

## Testing Instructions

- **Two harnesses, complementary** (decision veridao-8ys4):
  - **LiteSVM** (`programs/accord/tests/*.rs`, `make test_unit`) — fast in-process
    Rust unit/TDD per instruction. Wired via `anchor-litesvm` 0.4.x (tracks
    anchor-lang 1.x). The safe-solana-builder `references/litesvm.md` is the
    **checklist/pattern authority** for every instruction bean (happy/auth/
    reinit/time-lock/arithmetic/closure, sysvar, CU) — wiring differs, concepts
    don't.
  - **jest + Surfpool** (`tests/`) — full e2e: CPI chains, VRF, real
    validator behaviour.
- **TDD only.** RED → GREEN → REFACTOR for every feature/instruction. Write the
  failing test first, then implement to pass. No exceptions.
- **LiteSVM `--features no-entrypoint`.** The program's `entrypoint!` symbol
  collides with a builtin when the program crate is statically linked into the
  test binary, so Rust tests build `accord` with `no-entrypoint` (types only).
  The `.so` (built separately via `cargo build-sbf` / `anchor build`, WITH the
  entrypoint) is what LiteSVM loads. `make test_unit` handles both steps.
  All `*_litesvm.rs` test files are gated with `#![cfg(feature = "no-entrypoint")]`
  so `anchor build` (which doesn't pass the feature) skips them during IDL gen.
- **Toolchain note:** `anchor build` works end-to-end on anchor 1.0.2 + Solana
  3.x deps — IDL generation is unblocked. `cargo build-sbf` invoked directly
  still needs `--tools-version v1.52` while Solana CLI < 3.x is installed (it
  bundles platform-tools v1.48 / cargo 1.84, which can't parse `edition2024`
  manifests). `make prep` installs Solana 3.1.10, which drops the flag.
  `anchor build` manages its own toolchain and is unaffected.
- Integration tests live in `tests/` (jest, run against a live validator).
- Rust unit tests live inline (`#[cfg(test)]`) in the program crate.
- First real test ships with the first Accord instruction (`create_subaccord`).
- Run `make lint` and the relevant test before committing. A milestone is
  `completed` only when all its leaf tests are green.

### e2e suite — `tests/src` (Surfpool + jest + SDK)

The jest suite in `tests/src/` is the **integration proof**: it drives the real
program through the `@useaccord/sdk` facade against a live Surfpool instance.
LiteSVM is the fast inner TDD loop; **e2e is the sign-off**, never skipped for a
feature that touches the chain.

- **Surfpool program deployment — do NOT start `surfpool` bare.** Surfpool does
  not auto-deploy like `solana-test-validator --bpf-program`; it deploys via the
  committed runbook `runbooks/deployment/main.tx` (`instant_surfnet_deployment =
  true` cheatcode ⇒ direct program-data write, instant + deterministic) when
  started with `--yes` (skips runbook-generation prompts). `make run_surfpool`
  runs `surfpool start --yes --db :memory:` — the `--db :memory:` guarantees a
  fresh Surfnet each start (singleton-PDA specs like `lifecycle.pause` stay
  restart-safe). It airdrops `~/.config/solana/id.json`. If the program is
  missing, `setup/env.ts` throws a clear `make run_surfpool` hint instead of
  cascading red tests.

- **Modular harness (mandatory — no copy-paste of RPC/payer/send boilerplate).**
  Shared setup lives in `tests/src/setup/`, imported by every spec:
  - `setup/env.ts` — `createTestEnv()` → `TestEnv` (`up`, `rpcUrl`, `rpc`, funded
    `payer`, `accord` facade, `programId`, `sendIx(ix)`); `fundSigner(env)` for
    SOL-funded jurors/appellants. Probes the validator + gates on program deploy.
  - `setup/cheats.ts` — `surfnet_*` cheatcodes. **Warp split (don't mix):**
    `warpForwardSeconds(env, s)` for timestamp window gates (commit/reveal/
    snapshot-challenge/appeal — via `surfnet_timeTravel` ms-timestamp);
    `warpForwardSlots(env, n)` for slot timelocks (propose/execute update,
    unpause — overwrites the Clock sysvar, because `timeTravel` wraps slots at
    `slotsInEpoch`). Also `readClock`, `setClock`, `setAccountRaw` (HEX), `cheat`.
  - `setup/tokens.ts` — `createMint` (hand-encoded 82-B Mint via `setAccount`),
    `setTokenBalance` (`surfnet_setTokenAccount`), `TOKEN_PROGRAM_ID`. Derive the
    vault ATA with Kit `getProgramDerivedAddress` (ATA program
    `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`) — NOT `@solana/spl-token`
    (it pulls web3.js v1 → jest breaks on `uuid` ESM).
  - `setup/vrf.ts` — `injectCommittedVrf(env, dispute, vrf32)`: writes
    `committed_vrf` directly. Use INSTEAD of the SDK `requestVrf` — the on-chain
    `request_vrf` CPIs the magicblock VRF oracle, which is not on a Surfnet.
  - `setup/assertions.ts` — `expectAccordAccount(env, pda)` +
    `fetchDecoded(env, pda, getXDecoder())`. **Use `fetchDecoded`**, not the
    facade's `fetchX`/`getRuling`/`fetchJurorStake` — those need a
    `ClientWithRpc` and break over a raw `createSolanaRpc`. Account decoders are
    re-exported from `@useaccord/sdk`.
  - `setup/fixtures.ts` — `randomBytes32()`, `DEFAULT_PUBKEY`,
    `defaultSubaccordArgs(...)`.
  One spec file per instruction group (`lifecycle.pause.timelock`,
  `lifecycle.update`, `lifecycle.subaccord`, `staking`, `dispute`, `snapshot`,
  `voting`, `appeal`, `draw`, `full-lifecycle`) + `draw-harness.ts` (the shared
  VRF/MST composite). Each spec is port-agnostic (reads `ACCORD_RPC_URL`) and
  idempotently guards the PauseState singleton, so the **whole suite runs GREEN
  together on one Surfnet** (`make test_surfpool`).

- **The green rule (non-negotiable).** A feature/milestone is **not complete**
  until its e2e spec passes against a running Surfpool — not skipped. "Skip if
  validator down" is permitted only for the offline CI lane; for local + the
  Surfpool lane the e2e MUST be GREEN:
  1. `make run_surfpool` (terminal 1) — must show the Accord program deployed.
  2. `make test_surfpool` (terminal 2) — every touched spec green.
  Adding or changing an instruction ⇒ add/extend its e2e spec **in the same
  change**. Shipping an instruction without a green e2e spec is a blocker, not a
  follow-up. LiteSVM proves the unit contract first; the e2e spec proves the
  SDK↔program↔Surfpool integration.

## Accord (Program B — built first)

Standalone Schelling-point arbitration primitive. v1 instruction set target:

```
create_subaccord(params, authority, evidence_operator)    — permissionless Subaccord
propose/execute_subaccord_update                          — authority-gated, 48h on-chain timelock
stake(amount) / unstake(amount)                           — Juror capital; unstake blocked while active_draws > 0
create_dispute(subaccord, options, evidence_hash, fee)    — [Arbitrable CPI]; filer pays full fee
post_snapshot(dispute, merkle_root)                       — off-chain indexer; 1× bond; 1-day challenge window
challenge_snapshot(dispute, fraud_proof)                  — contest a wrong root within the window
draw(dispute, vrf, memberships[])                         — VRF; N distinct Jurors over the Snapshot
commit / reveal                                           — hash(vote, salt, juror_pubkey) then {vote, salt}
appeal(dispute)                                           — permissionless; 2N+1; bond forfeited if no flip
finalize_round / finalize_dispute                         — permissionless crank; redistribution + active_draws--
get_ruling(dispute)                                       — lazy read by the Arbitrable
pause() / unpause()                                       — multisig circuit-breaker
```

Authority: `PROJECT.md`, `programs/accord/SPEC.md`, `apps/docs/adr/accord/0001` (Schelling), `0002` (per-Subaccord staking token, no token v1), `0003` (draw), `0004` (party-agnostic), `0005` (Subaccord authority), `0006` (evidence), `0007` (upgrade), `0008` (snapshot trust), `0009` (sortition), `0010` (SDK facade), `0011` (evidence daemon), `0012` (on-chain accumulator), `0017` (evidence data format), `0019` (dispute-kit aggregation), `0022` (per-Subaccord appeal window), `0015` (evidence crypto → `@useaccord/sdk/evidence`).

## Build Order

1. **Accord** — standalone arbitration. The focus of this repo.
2. **v2** — Arcium encrypted vote-tally (Juror vote privacy), accord token, tranched staking.
3. **v3** — futarchy governance, evidence markets, AI risk pricing, ZK proofs.

## v1 Defaults (configurable per Subaccord)

| Parameter            | Default               | Notes                                 |
| -------------------- | --------------------- | ------------------------------------- |
| Jurors per dispute   | 3                     | Per Subaccord                         |
| Review window        | 7 days                | Jurors assess evidence                |
| Commit window        | 2 days                | `hash(vote, salt)`                    |
| Reveal window        | 2 days                | `{vote, salt}`                        |
| Appeal window        | 3 days                | Per-Subaccord (ADR-0022); floor 1h (`MIN_APPEAL_WINDOW_SECS`) |
| Alpha (slash factor) | 10%                   | Incoherent juror stake lost           |
| Min juror stake      | 1,000 (staking_token) | Draw eligibility; per-Subaccord token |
| Max appeals          | 3                     | 3 → 7 → 15 → 31 jurors                |

## Beans

**IMPORTANT:** before doing anything else, run `beans prime` and `hordr prime`
and heed the output. Include relevant bean IDs in commit messages. Config lives
in `.beans.yml` (prefix `Accord-`).

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

- **Program ID.** `declare_id!` and `Anchor.toml [programs.*]` are kept in sync
  with `target/deploy/accord-keypair.json` via `anchor keys sync`. The keypair
  was provisioned by `solana-keygen`; `anchor build` uses it for the `.so`.
- **Per-Subaccord staking token.** Each Subaccord defines its `staking_token` at
  creation (ADR-0002); USDC is the common default, not hard-coded.
- **Evidence crypto lives in the SDK, not the daemon.** The ECIES / AES-256-GCM
  / HKDF-SHA256 / Ed↔X25519 evidence protocol is a multi-party wire contract
  shared by claimant, operator, and juror — it lives in
  `@useaccord/sdk/evidence` (ADR-0015), **not** `apps/evidence-daemon`. The daemon
  keeps only `EnvKeyring`, S3 storage, the pipeline, and HTTP; it imports the
  protocol from the SDK. Don't reimplement crypto primitives in the daemon or an
  Arbitrable — import `@useaccord/sdk/evidence` (backed by `@noble`; nothing
  hand-rolled).
