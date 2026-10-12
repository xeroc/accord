
## Scope

- [x] Diagnose `rpc.getAccountInfo is not a function` on `draw:await-vrf`
- [x] Fix facade wiring (accord + canon + synod): `accordProgram()({ rpc })` per kit 7 program-client contract
- [x] Regression test: `packages/sdk/src/accord.test.ts` (`client.rpc === facade.rpc`)
- [x] `useaccord dispute:show <pda>` — full interpreted Dispute view (lib/dispute-view.ts + commands/dispute/show.ts + tests)
- [x] Skill docs (SKILL.md routing + 04-dispute.md), changeset, AGENTS.md harness-note refresh

## Design decisions

- Root cause: kit 7 `@solana/program-client-core` fetchers read `client.rpc`; facades passed the raw RPC proxy (cast-suppressed). On the proxy, `client.rpc` is a fabricated JSON-RPC method-builder function → `getAccountInfo` undefined.
- Fix keeps the plugin client (consumers: apps/app rpc.ts context, sdk-pipeline e2e surface assertions, evidence-daemon test stubs) and passes `{ rpc: this.rpc } as unknown as …PluginRequirements` — deliberately partial: planTransaction/sendAndConfirmTransaction unwired (no consumer uses plugin plan/send wrappers; adapter builds instructions via generated free builders). Comment in accord.ts names the ceiling.
- `dispute:show` reads via raw `fetchMaybeDispute(rpc, addr)` (same as read:dispute) and renders through pure `dispute-view.ts`: DisputeState→name, NO_RULING/`u64::MAX`→null, `[0u8;32]` evidence→null, ISO timestamps, aggregation-labeled ruling. Missing account ⇒ `{exists:false}` exit 0 (read:dispute contract).

## Summary of Changes

- packages/sdk/src/accord.ts — `accordProgram()({ rpc: this.rpc } as unknown as AccordPluginRequirements)`; dist rebuilt
- packages/canon/src/canon.ts, packages/synod/src/synod.ts — same one-line fix; dists rebuilt
- packages/sdk/src/accord.test.ts — NEW regression pin
- apps/cli/src/lib/dispute-view.ts — NEW pure view (disputeView + renderDisputeHuman + ZERO_HASH)
- apps/cli/src/commands/dispute/show.ts — NEW command
- apps/cli/test/lib/dispute-view.test.ts, apps/cli/test/commands/dispute/show.test.ts — NEW (TDD: RED confirmed first)
- .agents/skills/useaccord/SKILL.md + references/04-dispute.md — dispute:show routing + section + SDK table row
- .changeset/facade-clientwithrpc-dispute-show.md — patch (fixed group)
- AGENTS.md — stale "facade fetchers break over raw createSolanaRpc" rationale replaced
- Verified live on devnet: dispute BTkdQfTDX… show (human + json) and draw:await-vrf returns committed VRF; suites: SDK 112 pass, canon 3, synod 4, CLI 156, tsc/eslint clean on cli+sdk+canon+synod+app+cranker+evidence-daemon.
