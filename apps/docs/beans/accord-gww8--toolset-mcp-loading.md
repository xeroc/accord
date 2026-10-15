---
# accord-gww8
title: Toolset & MCP loading
status: todo
type: task
created_at: 2026-10-15T07:32:41Z
updated_at: 2026-10-15T07:32:41Z
parent: accord-sglt
---

src/agent/tools.ts: Zod-typed read-only tools (read_dispute, read_subaccord, fetch_evidence_file, read_domain_doc); MCP servers from config via @ai-sdk/mcp createMCPClient, merged toolset. No key/shell/fs-write tools, ever. AC: tool schema tests; MCP config loads (stub server).
