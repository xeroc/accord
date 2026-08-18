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
  accord/            Accord — Schelling-point arbitration (source of truth)
  canon/             Canon — curated-list registry Arbitrable (ADR canon/0001)
  synod/             Synod — N-party dispute-escrow Arbitrable (stub; SPEC + ADRs synod/0001-0002)
packages/
  sdk/              @useaccord/sdk — TypeScript SDK (IDL clients, PDA helpers, CPI wrappers); @useaccord/sdk/evidence — shared evidence crypto protocol (ADR-0015)
  canon/            @useaccord/canon — Canon SDK facade (Codama client + PDA helpers)
tests/              @useaccord/tests — jest integration suite (runs vs test-validator / Surfpool)
apps/               User-facing applications (cli, cranker, evidence-daemon, app, canon, landing, docs)
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

- `make prep` — install Solana (3.1.10) + Anchor (1.0.2) via avm, then `pnpm install`
- `make build` — `anchor build` (programs) then `pnpm -r run build` (packages/apps)
- `make lint` — `pnpm -r run lint` across every workspace that declares a lint script
- `pnpm --filter <pkg> run lint:fix` — auto-fix lint in one package (not all packages define `lint:fix`)
- `anchor test` — full suite: Rust unit tests + LiteSVM + jest e2e. Anchor
  auto-starts a Surfpool instance, deploys the `.so`, and runs everything. No
  separate validator terminal needed.
- `make test` — `anchor build --ignore-keys` + `anchor test --skip-build`
  (same as `anchor test` but with the canonical-keypair guard)
- `make test_unit` — LiteSVM Rust unit/TDD tests only (fast, no validator): builds the `.so` then runs `cargo test --features no-entrypoint` in `programs/accord`
- `make run_surfpool` — start a Surfpool Surfnet manually (for isolated e2e debugging; `anchor test` starts its own)
- `make test_surfpool` — jest e2e suite only (needs a running Surfpool/validator)
- `cd tests && npx jest` — run only the `tests/` TypeScript integration suite (needs a validator at `127.0.0.1:8899`)
- `cd tests && npx jest -t "<name>"` — run a single test by name
- `cd packages/sdk && pnpm run build` — build the SDK
- `cd programs/accord && cargo test` — Rust unit tests for the Accord in isolation

### Workflow tests

The github pipeline runs these tests and requires them to succeed!

        pnpm run -r --filter "./packages/*" --filter "./apps/*" lint
        pnpm run -r --filter "./packages/*" --filter "./apps/*" build
        pnpm run -r --filter "./packages/*" --filter "./apps/*" test

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
  **Code** renames ripple further still — see §Change Coupling.
- **When behavior and docs disagree, trust the code — then reconcile.** Don't
  bend a test to match a stale doc; don't rewrite a doc to match a bug. Decide
  which is correct, fix the wrong one, update the other.

## Change Coupling — touch every affected part

The on-chain program is the **source of truth**; every downstream layer is
derived from it or binds to it. `anchor build` emits each program's IDL into
`target/idl/<program>.json`; `make codegen` runs `codama run js` in
`packages/sdk` to regenerate `src/generated/` from the Accord IDL. (`canon` has
its own `codama.json` + client under `packages/canon` — regenerate it the same
way when `programs/canon` changes.) **Never hand-edit `src/generated/`** —
change the program, regenerate, commit the regenerated output.

**A change that compiles in the part you edited is not done.** The SDK is the
contract every consumer binds to; a signature drift between the program, the
SDK facade, and a consumer is a bug even if your one package builds. After any
IDL-touching change, run `make codegen && pnpm -r run build` and the relevant
tests — **the whole workspace must stay green**, not just the package you
touched. (The `appeal` build break was a consumer left on the old one-arg
signature after the SDK had already moved to two.)

### Parts

| Part              | Path                                                                          | Role                                                                                              |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Program           | `programs/accord/` (`lib.rs`, `state.rs`), `programs/canon/`, `programs/synod/` (stub — no IDL until its first build) | Source of truth; IDL emitted by `anchor build`.                                                   |
| Generated clients | `packages/sdk/src/generated/`, `packages/canon/`                              | Codama output from the IDL — regenerated, never hand-edited.                                      |
| SDK facades       | `packages/sdk/src/methods/*.ts`, `pda.ts`, `token.ts`, `fetch.ts`, `index.ts` | Hand-written public surface over the generated client.                                            |
| e2e tests         | `tests/src/`                                                                  | Drives the program through the SDK facade (Surfpool).                                             |
| CLI               | `apps/cli/`                                                                   | `useaccord` — consumes the SDK.                                                                   |
| Cranker           | `apps/cranker/`                                                               | Lifecycle cranker — consumes the SDK.                                                             |
| Evidence daemon   | `apps/evidence-daemon/`                                                       | Consumes `@useaccord/sdk` + `@useaccord/sdk/evidence`.                                            |
| App               | `apps/app/`                                                                   | Frontend — consumes the SDK.                                                                      |
| Docs              | `programs/*/SPEC.md`, `apps/docs/`, ADRs, `README.md`                         | Must describe the code as it is.                                                                  |
| Agent skills      | `.agents/skills/useaccord/`                                                   | CLI command + flag reference consumed by agents; mirrors `useaccord …` invocations + flag tables. |

### When you change X, also touch Y

- **Instruction signature** (add/rename/remove an arg or account in `lib.rs`):
  `make codegen` → update the hand-written facade in
  `packages/sdk/src/methods/<area>.ts` → **every call site** in
  `apps/cli/src/commands/`, `apps/cranker/`, and `tests/src/<area>.spec.ts` →
  the LiteSVM unit contract (`programs/accord/tests/`) → the SPEC instruction
  table (and an ADR if architectural). _E.g. adding `new_evidence_hash` to
  `appeal` means the SDK `appeal(accounts, newEvidenceHash)` signature, the CLI
  `appeal:open` call, and every e2e `appeal()` call must all pass it._

- **Account field** (add/rename/remove a field in `state.rs`): `make codegen`
  → every **object literal** constructing that account —
  `apps/cranker/src/*.test.ts` fixtures, `tests/src/setup/fixtures.ts` — plus
  any pure helper in `packages/sdk/src/methods/` that reads the field → the SPEC
  account table. _E.g. `Dispute.evidence_hash` → `evidence_hashes[]` ripples
  into every fixture that builds a `Dispute`._

- **New instruction:** all of the above, plus a new `apps/cli` command, a new
  e2e spec (mandated in §Testing Instructions), and an update to
  `programs/accord/accord.qedspec` (§Beans #4).

- **SDK public surface** (new/renamed export — a PDA, ATA helper, codec):
  migrate **every consumer** (`apps/cli`, `apps/cranker`, `apps/evidence-daemon`,
  `apps/app`) to it. No parallel hand-rolled implementations — the SDK is the
  single source for PDA/ATA derivation, codecs, and account fetchers.

- **CLI command or flag** (add/rename/remove a command, or rename/make-optional
  a flag): the `.agents/skills/useaccord/` skill documents exact `useaccord …`
  invocations + flag tables (`SKILL.md` routing + `references/*.md`). Update
  every example + flag list there in the same change — a renamed or newly-
  optional flag makes the skill's copy-paste commands fail or silently behave
  differently. Cross-check the SDK fn + source line each skill cites, too (they
  drift on program changes). _E.g. making `draw:request-vrf --program-identity`
  optional, or adding `appeal:open --evidence`, must update the skill's command
  examples._

- **Error code / enum variant:** `programs/accord` `#[error_code]` →
  `make codegen` → `packages/sdk` error map → any consumer that switches on the
  name.

### How to know you got them all

- `make codegen && pnpm -r run build` is the primary guard — a stale facade or
  consumer call site fails the type-check workspace-wide.
- `grep -rn "<old-name>" programs packages tests apps` before calling a rename
  done. The §Documentation rule "Renames/drops are doc changes too" is the
  **docs** half; the matrix above is the **code** half — both apply on every
  rename.
- CLI command/flag change ⇒ `grep -rn "<flag>" .agents/skills/useaccord` — the
  skill's command examples and flag tables must carry the new name/arity. (A
  `SKILL.md` routing-table link to a missing reference is itself a drift
  signal.)

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

- **Surfpool program deployment.** `anchor test` (and thus `make test`)
  auto-starts a Surfpool instance, deploys the `.so` via the committed runbook
  (`runbooks/deployment/main.tx` — `instant_surfnet_deployment = true`), and
  tears it down when the suite finishes. No separate terminal needed.
  For **isolated e2e debugging**, start Surfpool manually:
  `make run_surfpool` runs `surfpool start --yes --db :memory:` — the
  `--db :memory:` guarantees a fresh Surfnet each start (singleton-PDA specs
  like `lifecycle.pause` stay restart-safe). It airdrops
  `~/.config/solana/id.json`. Then `make test_surfpool` to run jest against it.
  If the program is missing, `setup/env.ts` throws a clear
  `make run_surfpool` hint instead of cascading red tests.

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
    idempotently guards the AccordState singleton, so the **whole suite runs GREEN
    together on one Surfnet** (`make test_surfpool`).
- **The green rule (non-negotiable).** A feature/milestone is **not complete**
  until its e2e spec passes against a running Surfpool — not skipped. "Skip if
  validator down" is permitted only for the offline CI lane; for local + the
  Surfpool lane the e2e MUST be GREEN:
  - Primary: `make test` — runs the full suite (Rust + LiteSVM + jest e2e).
    `anchor test` auto-starts Surfpool, deploys, and runs everything.
  - Isolated debugging: `make run_surfpool` (terminal 1), then
    `make test_surfpool` (terminal 2) — every touched spec green.
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
commit / reveal                                           — hash(vote_le8, salt, juror_pubkey) then {vote: u64, salt}; vote = option index (Plurality, gate vote < num_options) or u64 fixed-point scalar (Median, gate vote != u64::MAX; ADR-0025)
appeal(dispute)                                           — permissionless; 2N+1; bond forfeited if no flip
finalize_round / finalize_dispute                         — permissionless crank; redistribution + active_draws--
redraw(dispute)                                            — permissionless; shortfall redraw (slash no-shows, draw_attempt++) / Failed on exhaustion (ADR-0021)
withdraw_fees                                              — per-juror earned-fee pull from fee_vault (ADR-0020)
get_ruling(dispute)                                       — lazy read by the Arbitrable
pause() / unpause()                                       — multisig circuit-breaker
```

Authority: `PROJECT.md`, `programs/accord/SPEC.md`, `apps/docs/adr/accord/0001` (Schelling), `0002` (per-Subaccord staking token, partially superseded by 0020), `0003` (draw), `0004` (party-agnostic), `0005` (Subaccord authority), `0006` (evidence), `0007` (upgrade), `0008` (snapshot trust), `0009` (sortition), `0010` (SDK facade), `0011` (evidence daemon), `0012` (on-chain accumulator), `0017` (evidence data format), `0019` (dispute-kit aggregation), `0022` (per-Subaccord appeal window), `0015` (evidence crypto → `@useaccord/sdk/evidence`), `0020` (two-mint/two-vault economics), `0021` (reveal quorum + shortfall redraw), `0025` (scalar voting — u64 votes, `Median`, coherence band).

## Synod (Arbitrable — specced, stub crate)

N-party dispute-escrow over Accord: named 2–7 party roster, equal stake `S` in
the Subaccord's `fee_token`, file-on-full-roster (missed deadline → crank
refunds), one CPI dispute (`option i ≡ party i`, neutral last), pot `N·S − fee`
to the prevailing party. Passive appeals. **Hard Core dependency before its
e2e: the tally tie fix (bean `accord-n3vw`).** Program ID is the scaffold
placeholder — provision the canonical keypair before first build. Authority:
`programs/synod/SPEC.md`, ADRs `synod/0001`–`0002`, design ledger
`meta/specs/PROG-MULTI-PARTY.md`. Sister Arbitrable: `programs/canon`
(curated lists — ADR `canon/0001`, SPEC in-crate).

## Build Order

1. **Accord** — standalone arbitration. The focus of this repo.
2. **Arbitrables** — Canon (curated lists, built) · Synod (N-party escrow,
   specced + scaffolded; blocked on `accord-n3vw` for e2e).
3. **v2** — Arcium encrypted vote-tally (Juror vote privacy), accord token, tranched staking.
4. **v3** — futarchy governance, evidence markets, AI risk pricing, ZK proofs.

## v1 Defaults (configurable per Subaccord)

| Parameter            | Default                  | Notes                                                                                |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| Jurors per dispute   | 3                        | Per Subaccord                                                                        |
| Review window        | 7 days                   | Jurors assess evidence                                                               |
| Commit window        | 2 days                   | `hash(vote, salt)`                                                                   |
| Reveal window        | 2 days                   | `{vote, salt}`                                                                       |
| Appeal window        | 3 days                   | Per-Subaccord (ADR-0022); floor 1h (`MIN_APPEAL_WINDOW_SECS`)                        |
| Alpha (slash factor) | 10%                      | Incoherent juror stake lost (staking_token)                                          |
| Min juror stake      | 1,000 (staking_token)    | Draw eligibility; collateral mint (ADR-0020)                                         |
| Fee per juror        | Configurable (fee_token) | Compensation mint, separate from collateral (ADR-0020)                               |
| Max appeals          | 3                        | 3 → 7 → 15 → 31 jurors                                                               |
| Reveal threshold     | 6,666 bps (2/3)          | Reveal-quorum fraction; absolute commitment escalates per appeal for free (ADR-0021) |
| Shortfall policy     | `Redraw`                 | Same-size redraw via orthogonal `draw_attempt` (ADR-0021)                            |
| Max draw attempts    | 3                        | Per-round redraw cap before `Failed`; orthogonal to `max_appeals` (ADR-0021)         |
| Coherence tolerance  | 100 bps of median        | Median pools only (ADR-0025); `0` = exact; ≤10_000; immutable, frozen onto CaseTerms |

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

- **Program ID — canonical keypair `cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed`. ALL `anchor build` invocations MUST still pass `--ignore-keys` (every Makefile target does) — it is the guard that prevents `declare_id!` + the Codama client from being rewritten from the keypair. NEVER run `anchor keys sync` without the canonical keypair provisioned: it would rewrite `declare_id!` + `Anchor.toml`. Anchor.toml has no config-level `ignore-keys` option (verified, anchor 1.0.2); the flag is CLI-only.
- **Per-Subaccord staking token (collateral).** Each Subaccord defines its `staking_token` (collateral) at creation (ADR-0002/0020); USDC is the common default, not hard-coded.
- **Two mints / two vaults (ADR-0020).** Each Subaccord also defines a `fee_token` (compensation — fees + bonds). `stake_vault` (ATA of `staking_token`) holds collateral and is NEVER touched by dispute fee economics. `fee_vault` (ATA of `fee_token`) holds filer fees, appeal bonds, and the reward pool. Slashing is ledger-only (`stake_delta`); the `stake_vault` balance is invariant under slash+redistribution. `fees_earned` on `JurorStake` aggregates compensation across disputes; `withdraw_fees` pulls it (no `active_draws` gate, no timelock). `reveal` is vote-recording only — fees credit at `finalize_round`.

- **Evidence crypto lives in the SDK, not the daemon.** The ECIES / AES-256-GCM
  / HKDF-SHA256 / Ed↔X25519 evidence protocol is a multi-party wire contract
  shared by claimant, operator, and juror — it lives in
  `@useaccord/sdk/evidence` (ADR-0015), **not** `apps/evidence-daemon`. The daemon
  keeps only `EnvKeyring`, S3 storage, the pipeline, and HTTP; it imports the
  protocol from the SDK. Don't reimplement crypto primitives in the daemon or an
  Arbitrable — import `@useaccord/sdk/evidence` (backed by `@noble`; nothing
  hand-rolled).
