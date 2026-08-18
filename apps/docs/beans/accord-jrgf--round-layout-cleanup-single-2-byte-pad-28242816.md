---
# accord-jrgf
title: Round layout cleanup — single 2-byte pad (2824→2816)
status: completed
type: task
priority: normal
created_at: 2026-08-17T23:47:28Z
updated_at: 2026-08-18T00:03:14Z
---

## Summary of Changes

Round re-tiled: settled/bump now fill the 20-byte u32 block's alignment hole (20→24) and result joins the i64/u64 scalar block, so pads drop from _pad32[4]+_pad0[6] to a single _pad0[2]. Struct 2824→2816 bytes; data offsets (incl. disc): result @ 56, reveals[i] @ 2576+i*8; reveal_count @ 20 unchanged. Zero-pad impossible without inventing fields or widening bump (floor is 2 bytes — the u32(20)+u8(2) prefix can't tile 8).

Ripple: litesvm write_round_reveals + fabricated-round offsets; codegen x2 (generated codec pins pad0=2); cranker fixtures (pad32 dropped, pad0 2); SPEC.md + docs-site accounts.md + ADR-0025 layout walk updated.

Gates: cargo test 14+63+canon green; cranker 56/56; pnpm -r lint + build clean; full jest e2e 65/65 GREEN on a fresh Surfnet (ACCORD_RPC_URL alt-port lane while 8899 is held by another project's Surfnet daemon).
