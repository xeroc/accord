---
"@useaccord/jurat": patch
---

jurat: compose the daemon runtime in `src/main.ts` (bean accord-vruh) — the v1 pipeline modules existed and were unit-tested, but the entry point never mounted them, so `pnpm dev` booted and idled. New: `src/runtime.ts` (scan handler: join gates → executor with logged decisions; duty state machine: track → evidence → verdict → commit → reveal with the SPEC failure policy), file-backed duty/vote stores (`src/state/stores.ts`), WS hint layer kicking off-cycle scans, and the config knobs to drive it (`JURAT_SCAN_INTERVAL_MS`, `JURAT_MIN_SOL_LAMPORTS`, optional `JURAT_EVIDENCE_URL` + `JURAT_DELIVERY_KEY_PATH` — the delivery key is generated on first boot). SPEC/README/.env.example updated to match. The lockstep bump for the rest of the workspace comes from the `fixed` group in `.changeset/config.json` at version time — not from this frontmatter.

Follow-up (bean accord-fwl7): joins stake exactly the pool's own `min_stake` — there is no `JURAT_STAKE_AMOUNT` (a single configured amount cannot be unit-correct across pools with different staking mints; upstaking stays a manual operator action). Budget arithmetic (`JURAT_STAKE_BUDGET` / cap / reserve / book sums) is now per staking token, and zero-minimum pools are rejected at the gates.
