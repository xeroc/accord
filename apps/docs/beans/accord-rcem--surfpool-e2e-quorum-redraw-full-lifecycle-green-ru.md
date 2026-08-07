---
# accord-rcem
title: 'Surfpool e2e: quorum + redraw full lifecycle green-rule'
status: todo
type: task
priority: normal
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T23:00:01Z
parent: accord-z8jp
blocked_by:
    - accord-he1u
---

assigned: tester. tests/src spec: shortfall→redraw→eventual-threshold; Failed-on-exhaust refund; repeat-offender exclusion; full appeal+redraw interaction on Surfnet.

## Blocker (verified 2026-08-08T00:05Z) — needs human/infra call, NOT an ADR-0021 defect

The e2e green-rule cannot be satisfied in this worktree (`accord-z8jp`) due to a
**pre-existing deploy-keypair / `declare_id!` mismatch** that blocks ALL on-chain
program deployment here — independent of ADR-0021:

- `target/deploy/accord-keypair.json` pubkey = a **different** base58 address (not the canonical one)
- `declare_id!` (lib.rs) / SDK `ACCORD_PROGRAM_ID` / tests env / Surfpool runbook = the canonical Accord program address (`ERha4v…`)

The `.so` (built with `declare_id!("ERha4v…")`) cannot be deployed to `ERha4v…`
(no keypair for it), and deploying to the keypair address yields a runtime program-ID
mismatch. AGENTS.md says these are "kept in sync via `anchor keys sync`" — they
are out of sync in this worktree. Surfpool's runbook reports "Program ERha4v…
deployed" but `getAccountInfo(ERha4v…)` returns null (the e2e harness gates on
this and throws).

**Why not fixed in-lane:** the canonical ID `ERha4v…` is referenced across the
SDK, tests, runbook, AND the concurrent agent fleet (other opencode sessions on
`accord-w663` etc. are live). Running `anchor keys sync` (→ the keypair address) would
cascade through all of them. Regenerating a keypair for `ERha4v…` is impossible
(one cannot craft a keypair for an arbitrary pubkey). This is a worktree-setup
defect needing a principal decision: restore an `ERha4v…` keypair, or
coordinatedly migrate the canonical ID.

## Verified (ADR-0021 code is sound; only the live e2e is environment-blocked)

- Program: `anchor build` clean (IDL regenerated w/ redraw + draw_attempt +
  ShortfallPolicy + RedrawEligible); `make test_unit` **43/43 green** (incl. 6
  new ADR-0021 LiteSVM tests: threshold-met, shortfall→RedrawEligible, redraw
  slash/draw_attempt++, Failed-on-exhaust + filer refund, draw_attempt seed
  advance, reconciled no-show exclusion) — beans accord-5yh0 + accord-84vk.
- SDK: build + lint clean; `redraw()` facade + kit config + draw_attempt seed
  (accord-he1u). Docs: ADR-0021 wired across SPEC/draw-voting/trust-profile/
  AGENTS (accord-eifm).
- Surfpool chain side works: started a dedicated instance on `:8910`
  (`surfpool start --yes --db :memory: --port 8910`), runbook "deployment"
  completed, genesis airdrop to the `id.json` payer landed.

## Next (once the program-ID infra is resolved)

Write `tests/src/quorum-redraw.spec.ts` (spec is designed, mirrors the 6 LiteSVM
scenarios via the shared `draw-harness.ts`: `armSubaccordAndJurors` → `armDispute`
→ `resolveDistinctPanel` → `submitDraw` → commit/reveal N → `warpTo` reveal_end
→ `finalizeRound` → assert `RedrawEligible` → `redraw()` → assert `Created` +
`draw_attempt++` + no-show `stake_delta`; `Failed`-on-exhaust with `maxDrawAttempts: 1`;
appeal+redraw interaction). Run with `ACCORD_RPC_URL`/`ACCORD_WS_URL` pointed at the Surfpool instance and
`NODE_OPTIONS=--experimental-vm-modules npx jest quorum-redraw`.
