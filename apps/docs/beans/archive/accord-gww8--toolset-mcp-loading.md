---
# accord-gww8
title: Toolset & MCP loading
status: completed
type: task
created_at: 2026-10-15T07:32:42Z
updated_at: 2026-10-15T11:05:00Z
parent: accord-sglt
---

src/agent/tools.ts: Zod-typed read-only tools (read_dispute, read_subaccord, fetch_evidence_file, read_domain_doc); MCP servers from config via @ai-sdk/mcp createMCPClient, merged toolset. No key/shell/fs-write tools, ever. AC: tool schema tests; MCP config loads (stub server).

## Summary of Changes

- `apps/jurat/package.json` — added `ai@^7`, `zod@^4`, `@ai-sdk/mcp@^2` (milestone
  decision 6 stack; `tool()`/`ToolSet` verified against the installed v7
  types — `inputSchema` + `execute`).
- `apps/jurat/src/agent/tools.ts`:
  - `makeJuratTools(deps)` — exactly four Zod-typed read-only tools
    (`read_dispute`, `read_subaccord`, `fetch_evidence_file`,
    `read_domain_doc`), each executing through the injected
    `JuratToolDeps` seam (daemon wires it to SDK fetchers + evidence
    client). The builtin set is closed over four names — no key, shell,
    or fs-write surface exists, and executors route only through deps.
  - `loadMcpTools(servers)` — `createMCPClient({ transport: { type:
    "http", url, headers } })` per configured server, `client.tools()`
    merged; clients stay alive for lazy tool execution.
  - `mergeToolset(builtin, mcp)` — builtin wins on name collision (a
    server shadowing `read_dispute` would change what the agent believes
    it read); `buildToolset(deps, servers)` one-shot for the runner.
- `apps/jurat/src/agent/tools.test.ts` — 7 node:test cases: closed
  four-tool set + description/execute shape, per-tool schema
  accept/reject (missing + mistyped inputs), executor→seam routing with
  parsed args, collision precedence, stub-server MCP load (fetch-level
  streamable-HTTP stub: initialize → tools/list, JSON-RPC `result`
  nesting, notifications → 202), empty-config no-contact, end-to-end
  buildToolset merge with builtin precedence.
- Verified: `pnpm --filter @useaccord/jurat test` 34/34 green; `pnpm -r
  run build` + `pnpm -r run lint` green workspace-wide.
