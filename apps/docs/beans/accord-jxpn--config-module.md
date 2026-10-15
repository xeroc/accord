---
# accord-jxpn
title: Config module
status: todo
type: task
created_at: 2026-10-15T07:32:41Z
updated_at: 2026-10-15T07:32:41Z
parent: accord-sozc
---

src/config.ts env schema (evidence-daemon style): RPC url, keypair path, LLM primary+fallback (baseURL/key/model), MCP server defs path, join gates (token allowlists, min_stake/fee_per_juror ranges, alpha_bps cap, commit_window floor, budgets/caps/reserve), telegram token+chat, DRY_RUN default ON, state dir. .env.example. AC: unit tests for defaults, validation errors, dryRun default.
