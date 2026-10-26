---
# accord-lmcc
title: POST /trace route + TRACE config wiring
status: todo
type: task
created_at: 2026-10-23T09:32:57Z
updated_at: 2026-10-23T09:32:57Z
parent: accord-06nn
---

Route `POST /trace/:subaccord/:dispute/:juror` (ADDRESS guard pattern from routes.ts), body-cap reuse, `TRACE_ENABLED` (default false → 404), config in src/config.ts + .env.example, wiring in main.ts + ServerDeps. RED→GREEN: guard shapes, disabled 404, limits surface as 413, happy 201. TDD; tsc + lint green.
