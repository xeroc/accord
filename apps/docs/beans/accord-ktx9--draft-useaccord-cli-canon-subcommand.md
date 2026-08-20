---
# accord-ktx9
title: useaccord CLI canon subcommand
status: completed
type: feature
priority: normal
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-20T00:00:00Z
---

Add a `useaccord canon` subcommand group mirroring the existing accord command topics (create/list, submit, challenge, withdraw, read). Reuse @useaccord/canon. Command surface + flag tables (.agents/skills/useaccord) to be defined when unblocked.

## Summary of Changes

Added the `useaccord canon:*` command group (12 commands) to `apps/cli`, all thin wrappers over `@useaccord/canon` facades:

- **Create/list**: `canon:create-list` (CPIs the backing Subaccord; `--random-rules-hash` dev mode), `canon:lists` / `canon:list <addr>` reads.
- **Submit**: `canon:submit --list --account` — deposit read off the list (on-chain demands an exact `DepositMismatch` match, so no `--deposit` flag can drift).
- **Challenge**: `canon:challenge --item` — derives everything on-chain: list back-ref, fee mint, backing subaccord, dispute PDA `["dispute", list, dispute_count]`, accord state + fee vault; Accord CPI accounts ride `remaining_accounts`.
- **Withdraw**: `canon:request-withdrawal --item` (submitter-only), `canon:advance-withdrawal --item` (payee read off the item — payouts cannot be redirected).
- **Cranks**: `canon:advance-pending`, `canon:settle` (dispute/challenger/submitter read off the item), `canon:close-item`.
- **Reads**: `canon:item <addr>` (labeled `ItemState` line), `canon:items`.

Shared resolvers live in `apps/cli/src/canon-context.ts` (fetch-or-throw + item→list fan-out, mirroring `staking-context.ts`). `@useaccord/canon` added as a CLI workspace dep (tsup-inlined like the SDK) + `canon` oclif topic. Flag tables + surface documented in `.agents/skills/useaccord/references/11-canon.md` (SKILL.md routing row) and the CLI README.

Verified: `pnpm run lint` clean, `tsc --noEmit && tsup` build green, full CLI bun suite 140/140 (incl. new help-surface + `resolveRulesHash` tests), production `node bin/run.js canon --help` lists all 12 commands, `canon:create-list --dry-run` builds the correct instruction (Canon program id, derived list/subaccord PDAs, encoded args).
