---
# accord-jxpn
title: Config module
status: completed
type: task
created_at: 2026-10-15T07:32:41Z
updated_at: 2026-10-15T08:45:00Z
parent: accord-sozc
---


## Summary of Changes

- `src/config.ts` — `loadConfig(env)` evidence-daemon style (injectable env, throws with var name on every failure): `JURAT_RPC_URL`, `JURAT_KEYPAIR_PATH`; LLM primary trio + optional fallback trio (all-or-nogether); optional `JURAT_MCP_SERVERS_PATH`; join gates (`JURAT_STAKING_TOKENS`/`JURAT_FEE_TOKENS` comma allowlists ≥1 entry, `JURAT_MIN_STAKE_*` / `JURAT_FEE_PER_JUROR_*` bigint ranges with min≤max, `JURAT_ALPHA_BPS_CAP` default 2000, `JURAT_COMMIT_WINDOW_FLOOR` default 600 s, required `JURAT_STAKE_BUDGET`/`JURAT_SUBACCORD_CAP`/`JURAT_RESERVE_FLOOR` bigints); telegram pair (together-or-none); `JURAT_DRY_RUN` default ON (garbage throws — never silently disarms); `JURAT_STATE_DIR` default `./state`.
- `src/config.test.ts` — 13 bun tests, 41 asserts: full-env parse, defaults, dryRun accept/reject, every missing-required var, blank=missing, empty allowlist, split/trim, partial fallback/telegram groups, inverted ranges, malformed int/bigint.
- `.env.example` — every var documented, cranker comment style.
- `src/main.ts` — mounts `loadConfig()` (boots → logs rpc/state/dryRun; missing env aborts).
- `package.json` — adds `"test": "bun test"`.

AC verified: `bun test` 13/13; jurat + workspace `pnpm -r run build` and `pnpm -r run lint` exit 0; `make codegen` untouched. Note: bigint `noUncheckedIndexedAccess` forced a hoisted `USDC` const in tests.
src/config.ts env schema (evidence-daemon style): RPC url, keypair path, LLM primary+fallback (baseURL/key/model), MCP server defs path, join gates (token allowlists, min_stake/fee_per_juror ranges, alpha_bps cap, commit_window floor, budgets/caps/reserve), telegram token+chat, DRY_RUN default ON, state dir. .env.example. AC: unit tests for defaults, validation errors, dryRun default.
