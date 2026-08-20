# AGENTS.md

## Project Overview

**Accord** is a general-purpose, Schelling-point arbitration primitive on Solana (Anchor). Any program (the _Arbitrable_) files a Dispute via CPI; the Accord draws stake-weighted Jurors (VRF over an on-chain MST accumulator), collects commit-reveal votes, and emits a Ruling the filer reads lazily. It is a standalone, reusable product.

The name means _agreement, harmony_ — what the Schelling Point produces. The Schelling Point here is **honesty** — Jurors vote truthfully because coherent-with-majority is the profitable strategy.

Three on-chain programs, all built:

- **Accord** (`programs/accord`) — the arbitration primitive. The focus of this repo.
- **Canon** (`programs/canon`) — curated-list registry Arbitrable (ADR `canon/0001`).
- **Synod** (`programs/synod`) — N-party dispute-escrow Arbitrable (ADRs `synod/0001`–`0002`).

## Repository Layout

```
programs/
  accord/            Accord — Schelling-point arbitration (source of truth)
  canon/             Canon — curated-list registry Arbitrable
  synod/             Synod — N-party dispute-escrow Arbitrable
packages/
  sdk/               @useaccord/sdk — TS SDK (Codama clients, PDA/fetch/token helpers)
                     subpath ./evidence — shared evidence crypto protocol (ADR-0015)
  canon/             @useaccord/canon — Canon SDK facade
  synod/             @useaccord/synod — Synod SDK facade
  ui/                @useaccord/ui — shared design tokens + React UI modules (Storybook)
tests/               @useaccord/tests — jest e2e suite (Surfpool / test-validator)
apps/
  cli/               useaccord — operator CLI (bin: useaccord)
  cranker/           lifecycle cranker — advances disputes via permissionless instructions
  evidence-daemon/   evidence operator daemon (ADR-0011) — decrypt/re-encrypt service
  app/               Accord dApp (React + Vite)
  canon/ synod/      Canon / Synod dApps (React + Vite)
  landing/           landing page
  docs/              MkDocs site — docs/, adr/, beans/ (issue tracker storage)
reports/             security reviews (accord, canon)
runbooks/            Surfpool deployment runbooks (wired via txtx.yml + anchor test)
formal_verification/ Lean/QEDGen output — regenerated from programs/*/*.qedspec, never hand-edited
meta -> Obsidian vault  SYMLINK out of repo — design specs (meta/specs/PROG-*.md)
CONTEXT.md          Accord domain language (glossary)
PROJECT.md          Accord rationale + roadmap (v2/v3)
meta -> Obsidian vault  SYMLINK (committed; target outside repo) — design specs (meta/specs/PROG-*.md)
Cargo.toml          Rust workspace (programs/*)
Anchor.toml         Anchor workspace + provider + test script
Makefile            Build/test orchestration (root package.json has NO scripts by design)
pnpm-workspace.yaml TS workspace globs (apps/*, packages/*, tests)
tsconfig.base.json  Shared TS compiler options
```

> **Reading order for new agents:** `CONTEXT.md` (domain language) → this file (build/test, conventions, gotchas) → `apps/docs/adr/` (the _why_ behind every locked architectural decision). ADRs are authority on rationale; code is authority on current state.

### Where things live

| Looking for…                                                                                     | Go to                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain terms (Dispute, Juror, Subaccord, Round, …)                                               | `CONTEXT.md`                                                                                                                                                                                                                 |
| Why an architectural decision was made                                                           | `apps/docs/adr/{accord,canon,synod}/` — each dir has an `index.md`                                                                                                                                                           |
| What an instruction does                                                                         | `programs/<p>/SPEC.md`, then `programs/<p>/src/instructions/<ix>.rs`                                                                                                                                                         |
| Protocol constants (windows, timelocks, caps, seeds)                                             | `programs/accord/src/constants.rs`                                                                                                                                                                                           |
| Per-pool config (`alpha_bps`, `min_stake`, windows, `coherence_tol_bps`, `reveal_threshold_bps`) | `CaseTerms` in `programs/accord/src/state.rs`                                                                                                                                                                                |
| Program crate layout                                                                             | one module per instruction in `src/instructions/`, `state`/`errors`/`events`/`constants` beside `lib.rs` (accord adds `pda.rs`, `utils.rs`); inline host unit tests in `src/tests.rs`; LiteSVM suite in `tests/*_litesvm.rs` |
| SDK public surface                                                                               | `packages/sdk/src/` — `methods/*.ts` facades (colocated `*.test.ts`), `pda.ts`, `fetch.ts`, `token.ts`, `queries.ts`, `generated/` (Codama output — never hand-edit)                                                         |
| Evidence crypto protocol                                                                         | `packages/sdk/src/evidence/` → import as `@useaccord/sdk/evidence` (ADR-0015)                                                                                                                                                |
| CLI commands + flags                                                                             | `.agents/skills/useaccord/` — `SKILL.md` routing table → `references/01-09*.md`                                                                                                                                              |
| e2e harness                                                                                      | `tests/src/setup/` + `draw-harness.ts` / `synod-harness.ts` (see §Testing)                                                                                                                                                   |
| Security posture                                                                                 | `programs/accord/security-checklist.md`, `programs/synod/security-checklist.md`, `reports/`                                                                                                                                  |
| Pre-implementation design specs                                                                  | `meta/specs/PROG-*.md` (note: `meta` is a committed symlink into an Obsidian vault — the specs themselves live outside the repo)                                                                                             |
| Issues / work tracking                                                                           | beans CLI — bodies live in `apps/docs/beans/`                                                                                                                                                                                |

## Build / Test Commands

> The root `package.json` has no `scripts` block by design — the Makefile orchestrates builds, and lint/test fan out via pnpm's recursive filter. Don't add root scripts; they'd duplicate the Makefile.

- `make prep` — install Solana (3.1.10) + Anchor (1.0.2) via avm, `pnpm install`, and `poetry install` for the docs site
- `make build` — `anchor build --ignore-keys` (programs) → `pnpm -r run build` (packages/apps) → docs build → `make codegen`
- `make codegen` — regenerate Codama clients in `packages/sdk` and `packages/synod` (run after `anchor build`). Canon regenerates the same way via its own `codama.json`: `cd packages/canon && pnpm exec codama run js`
- `make test` — full suite: Rust unit + LiteSVM + jest e2e. `anchor test` auto-starts a Surfpool Surfnet (via the committed runbook `runbooks/deployment/main.tx`, `instant_surfnet_deployment = true`), deploys the `.so`, and tears it down. No separate validator terminal needed
- `make test_unit` — LiteSVM + host unit tests only, fast, no validator: `cargo test --features accord/no-entrypoint` from the workspace root
- `make lint` — `pnpm -r run lint` across every workspace that declares a lint script
- `make docs` / `make docs-serve` — build / live-serve the MkDocs site
- `pnpm --filter @useaccord/tests test` — jest e2e suite only, against an already-running validator (default `127.0.0.1:8899`, override with `ACCORD_RPC_URL`)
- `cd tests && npx jest -t "<name>"` — run a single e2e test by name
- `cd programs/accord && cargo test` — Accord Rust tests in isolation (⚠ without `--features no-entrypoint` the `*_litesvm.rs` files compile but are silently skipped)

### Workflow tests

The GitHub pipeline runs these and requires them to succeed (`.github/workflows/tests.yml`, `program-tests.yml`):

        pnpm run -r --filter "./packages/*" --filter "./apps/*" build
        pnpm run -r --filter "./packages/*" --filter "./apps/*" lint
        pnpm run -r --filter "./packages/*" --filter "./apps/*" test
        pnpm --filter @useaccord/ui build-storybook

plus `anchor test` per program (`program-tests.yml`).

## Code Style

### TypeScript

- Package `lint` is `tsc --noEmit` in packages; `apps/cli`, `apps/cranker`, and `apps/evidence-daemon` additionally run eslint + prettier (`lint:fix` available there).
- Tests colocated with source as `*.test.ts` in packages; e2e specs are `*.spec.ts` in `tests/src/`.
- `PublicKey` for all addresses, `anchor.BN` for all numbers (fixtures/tests).
- PDA/ATA derivation, codecs, and account fetchers come from the SDK packages — never hand-roll a second implementation in a consumer.

### Rust

- Program crates keep one module per instruction in `src/instructions/`, with `state` / `errors` / `events` / `constants` as sibling modules of `lib.rs`.

## Documentation

- **Docs match reality, always.** Code comments, doc-comments, `SPEC.md`, `security-checklist.md`, ADRs, and bean scope/summary sections must describe the code as it _is_ — not as it was planned, renamed-away, or "will be." A doc that narrates behavior the code doesn't have (e.g. "the tally dispatches off X" when it doesn't, or a struct field listed in an account table that no longer exists) is a bug: fix the doc or fix the code in the same change, never leave them diverged.
- **Forward-looking comments must be true today.** "Future variants ship as…" is allowed only if the described seam already exists in code (field present, dispatch wired). Otherwise mark it `// TODO` / "not yet implemented" or omit it — aspirational prose rots into lies silently.
- **Renames/drops are doc changes too.** When you rename or remove a field, instruction, or error, grep the whole docs surface (`SPEC.md`, `security-checklist.md`, `apps/docs/`, `README.md`, beans, ADRs) and update every reference in the same change. The MkDocs site (`apps/docs/docs/`) and `README.md` are part of this surface — stale names there are reality-mismatches. **Code** renames ripple further still — see §Change Coupling.
- **When behavior and docs disagree, trust the code — then reconcile.** Don't bend a test to match a stale doc; don't rewrite a doc to match a bug. Decide which is correct, fix the wrong one, update the other.

## Change Coupling — touch every affected part

The on-chain programs are the **source of truth**; every downstream layer is derived from them or binds to them. `anchor build` emits each program's IDL into `target/idl/<program>.json`; `make codegen` regenerates `packages/sdk/src/generated/` and `packages/synod/src/generated/` from the IDLs (canon likewise via its own `codama.json`). **Never hand-edit `src/generated/`** — change the program, regenerate, commit the regenerated output.

**A change that compiles in the part you edited is not done.** The SDK is the contract every consumer binds to; a signature drift between the program, the SDK facade, and a consumer is a bug even if your one package builds. After any IDL-touching change, run `make codegen && pnpm -r run build` and the relevant tests — **the whole workspace must stay green**, not just the package you touched. (The `appeal` build break was a consumer left on the old one-arg signature after the SDK had already moved to two.)

### Parts

| Part                | Path                                                                                                                                      | Role                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Programs            | `programs/{accord,canon,synod}/` (`lib.rs`, `state.rs`, `instructions/`)                                                                  | Source of truth; IDLs emitted by `anchor build`.                                                  |
| Generated clients   | `packages/{sdk,synod,canon}/src/generated/`                                                                                               | Codama output from the IDLs — regenerated, never hand-edited.                                     |
| SDK facades         | `packages/sdk/src/methods/*.ts`, `pda.ts`, `token.ts`, `fetch.ts`, `queries.ts`, `index.ts`; `packages/canon/`, `packages/synod/` facades | Hand-written public surface over the generated clients.                                           |
| Shared UI           | `packages/ui/`                                                                                                                            | Design tokens + React modules; consumed by every `apps/*` frontend.                               |
| e2e tests           | `tests/src/`                                                                                                                              | Drives the programs through the SDK facades (Surfpool).                                           |
| CLI                 | `apps/cli/`                                                                                                                               | `useaccord` — consumes the SDK.                                                                   |
| Cranker             | `apps/cranker/`                                                                                                                           | Lifecycle cranker — consumes the SDK.                                                             |
| Evidence daemon     | `apps/evidence-daemon/`                                                                                                                   | Consumes `@useaccord/sdk` + `@useaccord/sdk/evidence`.                                            |
| Frontends           | `apps/app/`, `apps/canon/`, `apps/synod/`, `apps/landing/`                                                                                | React + Vite — consume the SDK(s) + `@useaccord/ui`.                                              |
| Docs                | `programs/*/SPEC.md`, `apps/docs/`, ADRs, `README.md`                                                                                     | Must describe the code as it is.                                                                  |
| Agent skills        | `.agents/skills/useaccord/`                                                                                                               | CLI command + flag reference consumed by agents; mirrors `useaccord …` invocations + flag tables. |
| Formal verification | `programs/accord/accord.qedspec`, `programs/synod/synod.qedspec` → `formal_verification/`                                                 | qedspec is the source; the Lean/QEDGen directory is regenerated output.                           |

### When you change X, also touch Y

- **Instruction signature** (add/rename/remove an arg or account in `lib.rs`): `make codegen` → the hand-written facade in `packages/sdk/src/methods/<area>.ts` (or `packages/{canon,synod}`) → **every call site** in `apps/cli/src/commands/`, `apps/cranker/`, and `tests/src/<area>.spec.ts` → the LiteSVM unit contract (`programs/<p>/tests/`) → the SPEC instruction table (and an ADR if architectural). _E.g. adding `new_evidence_hash` to `appeal` means the SDK `appeal(accounts, newEvidenceHash)` signature, the CLI `appeal:open` call, and every e2e `appeal()` call must all pass it._

- **Account field** (add/rename/remove a field in `state.rs`): `make codegen` → every **object literal** constructing that account — `apps/cranker/src/*.test.ts` fixtures, `tests/src/setup/fixtures.ts` — plus any pure helper in `packages/sdk/src/methods/` that reads the field → the SPEC account table. _E.g. `Dispute.evidence_hash` → `evidence_hashes[]` ripples into every fixture that builds a `Dispute`._

- **New instruction:** all of the above, plus a new `apps/cli` command, a new e2e spec (mandated in §Testing Instructions), and an update to the program's `.qedspec` (§Beans).

- **SDK public surface** (new/renamed export — a PDA, ATA helper, codec): migrate **every consumer** (`apps/cli`, `apps/cranker`, `apps/evidence-daemon`, `apps/app`, `apps/canon`, `apps/synod`) to it. No parallel hand-rolled implementations — the SDK is the single source for PDA/ATA derivation, codecs, and account fetchers.

- **CLI command or flag** (add/rename/remove a command, or rename/make-optional a flag): the `.agents/skills/useaccord/` skill documents exact `useaccord …` invocations + flag tables (`SKILL.md` routing + `references/01-09*.md`). Update every example + flag list there in the same change — a renamed or newly-optional flag makes the skill's copy-paste commands fail or silently behave differently. Cross-check the SDK fn + source line each skill cites, too (they drift on program changes). _E.g. making `draw:request-vrf --program-identity` optional, or adding `appeal:open --evidence`, must update the skill's command examples._

- **Error code / enum variant:** `programs/<p>` `#[error_code]` → `make codegen` → `packages/sdk` error map → any consumer that switches on the name.

### How to know you got them all

- `make codegen && pnpm -r run build` is the primary guard — a stale facade or consumer call site fails the type-check workspace-wide.
- `grep -rn "<old-name>" programs packages tests apps` before calling a rename done. The §Documentation rule "Renames/drops are doc changes too" is the **docs** half; the matrix above is the **code** half — both apply on every rename.
- CLI command/flag change ⇒ `grep -rn "<flag>" .agents/skills/useaccord` — the skill's command examples and flag tables must carry the new name/arity. (A `SKILL.md` routing-table link to a missing reference is itself a drift signal.)

## Testing Instructions

- **Two harnesses, complementary** (decision veridao-8ys4):
  - **LiteSVM + host unit** (`programs/<p>/tests/*_litesvm.rs`, `src/tests.rs`, `make test_unit`) — fast in-process Rust per instruction. Wired via `anchor-litesvm` 0.4.x (tracks anchor-lang 1.x). The safe-solana-builder `references/litesvm.md` is the **checklist/pattern authority** for every instruction bean (happy/auth/reinit/time-lock/arithmetic/closure, sysvar, CU) — wiring differs, concepts don't.
  - **jest + Surfpool** (`tests/`) — full e2e: CPI chains, VRF, real validator behaviour.
- **TDD only.** RED → GREEN → REFACTOR for every feature/instruction. Write the failing test first, then implement to pass. No exceptions.
- **LiteSVM `--features no-entrypoint`.** The program's `entrypoint!` symbol collides with a builtin when the program crate is statically linked into the test binary, so Rust tests build with `no-entrypoint` (types only). The `.so` (built separately via `cargo build-sbf` / `anchor build`, WITH the entrypoint) is what LiteSVM loads. `make test_unit` passes the flag; plain `cargo test` does not — and then every `*_litesvm.rs` file silently skips. All `*_litesvm.rs` test files are `#![cfg(feature = "no-entrypoint")]`-gated so `anchor build` skips them during IDL gen.
- **Toolchain note:** `anchor build` works end-to-end on anchor 1.0.2 + Solana 3.x deps. `cargo build-sbf` invoked directly still needs `--tools-version v1.52` while Solana CLI < 3.x is installed (it bundles platform-tools v1.48 / cargo 1.84, which can't parse `edition2024` manifests). `make prep` installs Solana 3.1.10, which drops the flag.
- **Host unit tests** (`programs/<p>/src/tests.rs`) pin cross-cutting invariants (manual layout offsets, scoped VRF identity, MST accumulator math) — they run under `make test_unit` too.
- **The green rule (non-negotiable).** A feature/milestone is **not complete** until its e2e spec passes against a running Surfpool — not skipped. "Skip if validator down" is permitted only for the offline CI lane; for local + the Surfpool lane the e2e MUST be GREEN:
  - Primary: `make test` — runs the full suite (Rust + LiteSVM + jest e2e).
  - Isolated debugging: start Surfpool yourself (`surfpool start --yes --db :memory:` — the `:memory:` guarantees a fresh Surfnet each start, so singleton-PDA specs like `lifecycle.pause` stay restart-safe; it airdrops `~/.config/solana/id.json`), then `pnpm --filter @useaccord/tests test`. If the program is missing, `setup/env.ts` throws a clear deployment hint instead of cascading red tests.
  - Adding or changing an instruction ⇒ add/extend its e2e spec **in the same change**. Shipping an instruction without a green e2e spec is a blocker, not a follow-up. LiteSVM proves the unit contract first; the e2e spec proves the SDK↔program↔Surfpool integration.

### e2e suite — `tests/src` (Surfpool + jest + SDK)

The jest suite is the **integration proof**: it drives the real programs through the SDK facades (`@useaccord/sdk`, `@useaccord/canon`, `@useaccord/synod`) against a live Surfpool instance.

- **Spec map** — one spec file per instruction group: `lifecycle.*` (subaccord, update, pause timelock), `staking`, `accumulator`, `dispute`, `draw`, `voting`, `appeal`, `scalar`, `quorum-redraw`, `reclaim`, `attestation`, `evidence`, `sdk-pipeline`, `full-lifecycle`, plus the Arbitrables: `canon.spec`, `canon.challenge.spec`, `synod.{open-join,file,claim,refund,fixtures,full-lifecycle}.spec`. Shared composites: `draw-harness.ts` (VRF/MST) and `synod-harness.ts`. Each spec is port-agnostic (reads `ACCORD_RPC_URL`) and idempotently guards the AccordState singleton, so the **whole suite runs GREEN together on one Surfnet**.
- **Modular harness (mandatory — no copy-paste of RPC/payer/send boilerplate).** Shared setup lives in `tests/src/setup/`, imported by every spec:
  - `setup/env.ts` — `createTestEnv()` → `TestEnv` (`up`, `rpcUrl`, `rpc`, funded `payer`, `accord` facade, `programId`, `sendIx(ix)`); `fundSigner(env)` for SOL-funded jurors/appellants. Probes the validator + gates on program deploy.
  - `setup/cheats.ts` — `surfnet_*` cheatcodes. **Warp split (don't mix):** `warpForwardSeconds(env, s)` for timestamp window gates (commit/reveal/appeal — via `surfnet_timeTravel` ms-timestamp); `warpForwardSlots(env, n)` for slot timelocks (propose/execute update, unpause — overwrites the Clock sysvar, because `timeTravel` wraps slots at `slotsInEpoch`). Also `readClock`, `setClock`, `setAccountRaw` (HEX), `cheat`.
  - `setup/tokens.ts` — `createMint` (hand-encoded 82-B Mint via `setAccount`), `setTokenBalance` (`surfnet_setTokenAccount`), `TOKEN_PROGRAM_ID`. Derive the vault ATA with Kit `getProgramDerivedAddress` (ATA program `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`) — NOT `@solana/spl-token` (it pulls web3.js v1 → jest breaks on `uuid` ESM).
  - `setup/vrf.ts` — `injectCommittedVrf(env, dispute, vrf32)`: writes `committed_vrf` directly. Use INSTEAD of the SDK `requestVrf` — the on-chain `request_vrf` CPIs the magicblock VRF oracle, which is not on a Surfnet.
  - `setup/assertions.ts` — `expectAccordAccount(env, pda)` + `fetchDecoded(env, pda, getXDecoder())`. **Use `fetchDecoded`**, not the facade's `fetchX`/`getRuling`/`fetchJurorStake` — those need a `ClientWithRpc` and break over a raw `createSolanaRpc`. Account decoders are re-exported from `@useaccord/sdk`.
  - `setup/fixtures.ts` — `randomBytes32()`, `DEFAULT_PUBKEY`, `defaultSubaccordArgs(...)`.

## The programs

### Accord (`programs/accord`)

The full instruction set, account tables, and state machine live in `programs/accord/SPEC.md` — don't restate them here (they rot). Instruction modules are `src/instructions/<instruction>.rs`; protocol constants (windows, timelocks, `MAX_JURORS`, seeds) are pinned in `src/constants.rs`; per-pool economics live on `CaseTerms` (`state.rs`).

Load-bearing ADRs (full index: `apps/docs/adr/accord/index.md`): `0003`/`0009` (VRF draw over MST sortition), `0012` (on-chain stake accumulator — replaced the optimistic snapshot), `0013` (VRF oracle callback auth), `0014` (`Failed` state + `cancel_dispute` escape hatch), `0016` (pause scope split), `0018` (multi-round settlement against the final ruling), `0020` (two-mint/two-vault economics), `0021` (reveal quorum + shortfall redraw), `0023` (per-round evidence hashes), `0024` (attestation-gated Subaccords), `0025` (scalar/Median voting), `0026` (plurality tie → non-decisive redraw).

### Canon (`programs/canon`)

Curated-list Arbitrable over Accord (`create_list`, `submit_item`, `advance_pending`, `challenge_item`, `settle_item`, `request_withdrawal`, `advance_withdrawal`). SPEC in-crate; ADR `canon/0001`; SDK `packages/canon`; dApp `apps/canon`; e2e `canon.spec` / `canon.challenge.spec`; security review in `reports/canon/`.

### Synod (`programs/synod`)

N-party dispute-escrow Arbitrable: named 2–7 party roster, equal stake `S` in the Subaccord's `fee_token`, file-on-full-roster (missed deadline → crank refunds), one CPI dispute (`option i ≡ party i`, neutral last), pot `N·S − fee` to the prevailing party. Passive appeals. Instructions: `open_case`, `join`, `file_dispute`, `refund_roster_miss`, `claim`. Authority: `programs/synod/SPEC.md`, ADRs `synod/0001`–`0002`, design ledger `meta/specs/PROG-MULTI-PARTY.md`. SDK `packages/synod`; dApp `apps/synod`; e2e `synod.*.spec`.

## Beans

**IMPORTANT:** before doing anything else, run `beans prime` and `hordr prime` and heed the output. Include relevant bean IDs in commit messages. Config lives in `.beans.yml` (prefix `accord-`, bodies in `apps/docs/beans/`).

### Bean hygiene

1. **Check before creating.** Run `beans list --json`; scan for existing beans covering the same scope (there are hundreds — duplicates waste context). If a new bean subsumes an old one, scrap the old with a `## Reasons for Scrapping` section.
2. **Restructuring.** When a grilling changes scope, append a `## REWRITTEN SCOPE (date — supersedes content above)` section. Update titles via GraphQL (CLI has no `--title` flag). Don't scrap beans that have accumulated context — rewrite in place.
3. **Design decisions → milestone body.** Capture grilling resolutions as a "Design decisions" section (struct layouts, flow diagrams, rationale). Leaf tasks carry the TDD acceptance criteria.
4. **Program changes ⇒ update the program's `.qedspec`.** When a program gains instructions, update `programs/accord/accord.qedspec` / `programs/synod/synod.qedspec` and regenerate `formal_verification/`.
5. **Status flows up.** A milestone is `completed` only when all leaf tasks are `completed`; epics close when all features close.
6. **Active milestones may supersede code state.** Always check `beans list --json --ready` for in-flight work before assuming docs reflect reality.

## Gotchas

- **Program IDs — canonical keypairs.** Accord `cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed`, Canon `can5ZhfgQpi7jymkxE7uEv4ZVm3X2f51KThTUtdWrFs`, Synod `GdV5rbRd579LUs3zB2PkbBsJNCMSj55rwWdikGuobHeC`. ALL `anchor build` invocations MUST pass `--ignore-keys` (every Makefile target does) — it is the guard that prevents `declare_id!` + the Codama clients from being rewritten from the keypair. NEVER run `anchor keys sync` without the canonical keypair provisioned: it would rewrite `declare_id!` + `Anchor.toml`. Anchor.toml has no config-level `ignore-keys` option (verified, anchor 1.0.2); the flag is CLI-only.
- **Per-Subaccord staking token (collateral).** Each Subaccord defines its `staking_token` at creation (ADR-0002/0020); USDC is the common default, not hard-coded.
- **Two mints / two vaults (ADR-0020).** Each Subaccord also defines a `fee_token` (compensation — fees + bonds). `stake_vault` (ATA of `staking_token`) holds collateral and is NEVER touched by dispute fee economics. `fee_vault` (ATA of `fee_token`) holds filer fees, appeal bonds, and the reward pool. Slashing is ledger-only (`stake_delta`); the `stake_vault` balance is invariant under slash+redistribution. `fees_earned` on `JurorStake` aggregates compensation across disputes; `withdraw_fees` pulls it (no `active_draws` gate, no timelock). `reveal` is vote-recording only — fees credit at `finalize_round`.
- **Evidence crypto lives in the SDK, not the daemon.** The ECIES / AES-256-GCM / HKDF-SHA256 / Ed↔X25519 evidence protocol is a multi-party wire contract shared by claimant, operator, and juror — it lives in `@useaccord/sdk/evidence` (ADR-0015), **not** `apps/evidence-daemon`. The daemon keeps only `EnvKeyring`, S3 storage, the pipeline, and HTTP; it imports the protocol from the SDK. Don't reimplement crypto primitives in the daemon or an Arbitrable — import `@useaccord/sdk/evidence` (backed by `@noble`; nothing hand-rolled).
- **`meta` is a committed symlink** into `~/.obsidian/…` — `meta/specs/` design specs are readable in the worktree but their content lives outside the git repo.

## Storybook

When working on UI components in `packages/ui`, always use the `your-project-sb-mcp` MCP tools to access Storybook's component and documentation knowledge before answering or taking any action.

- **CRITICAL: Never hallucinate component properties!** Before using ANY property on a component from a design system (including common-sounding ones like `shadow`, etc.), you MUST use the MCP tools to check if the property is actually documented for that component.
- Query `list-all-documentation` to get a list of all components
- Query `get-documentation` for that component to see all available properties and examples
- Only use properties that are explicitly documented or shown in example stories
- If a property isn't documented, do not assume properties based on naming conventions or common patterns from other libraries. Check back with the user in these cases.
- Use the `get-storybook-story-instructions` tool to fetch the latest instructions for creating or updating stories. This will ensure you follow current conventions and recommendations.
- Check your work by running `run-story-tests`.

Remember: A story name might not reflect the property name correctly, so always verify properties through documentation or example stories before using them.
