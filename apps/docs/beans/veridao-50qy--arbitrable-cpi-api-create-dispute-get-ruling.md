---
# veridao-50qy
title: Arbitrable CPI API (create_dispute + get_ruling)
status: todo
type: task
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-04T21:51:58Z
parent: veridao-gqzm
---

src/methods/dispute.ts: the PRIMARY external surface. create_dispute (filed by an Arbitrable via CPI; filer pays full fee) and get_ruling (lazy read returning Option<u8>). Must be the cleanest API in the SDK — external integrators depend on it. Acceptance: create_dispute initializes the Dispute PDA; get_ruling returns None until finalized. See ADR-0010 + test matrix row 3.
