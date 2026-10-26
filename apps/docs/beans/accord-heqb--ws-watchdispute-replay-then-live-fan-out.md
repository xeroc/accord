---
# accord-heqb
title: WS /watch/:dispute — replay-then-live fan-out
status: todo
type: task
created_at: 2026-10-23T09:32:58Z
updated_at: 2026-10-23T09:32:58Z
parent: accord-0xih
---

src/server/watch.ts: Bun.serve websocket handlers + hono upgrade (server instance via closure); per-dispute subscriber Set + ring buffer (TRACE_BUFFER_PER_DISPUTE); on connect: hello + replay (store tail + ring buffer) then live frames; per-IP conn cap (TRACE_MAX_CLIENTS_PER_IP); ping/pong keepalive. RED→GREEN via bun ws client: connect mid-duty gets hello+replay+live, frames seq-ordered, cap enforced (second conn from same IP dropped when over).
