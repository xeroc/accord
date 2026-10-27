---
# accord-w4j7
title: Duty-lifecycle emitters + runtime wiring
status: completed
type: task
created_at: 2026-10-23T09:32:58Z
updated_at: 2026-10-23T13:20:00Z
parent: accord-c19g
---

RuntimeDeps.trace?: TraceSink; emit duty-open (round, seat, windows) at tracking, evidence (paths+sha256+bytes) after intake, sealed verdict (unsealAt = round.revealEnd, or omitted in open mode), commit/reveal (tx sig / dryRun), abstain (kind, reason). Wire RemoteTraceSink in main.ts. RED→GREEN with a fake sink: full mock-duty run emits the HANDOFF §1 sequence; DRY_RUN path emits commit{dryRun:true}; abstain path emits abstain; trace failure never fails the duty.

## Summary of Changes

- `RuntimeDeps.trace?: (subaccord, dispute) => TraceSink` — a binder, not a bare sink: each sink is bound to one duty route + sig identity, so the runtime binds per-duty. `makeTraceSinkBinder` (sink.ts) memoizes per (subaccord, dispute) so queue + seq survive across scans (a fresh sink per scan would restart seq and the daemon would idempotently-drop everything).
- Emitters: `duty-open` fires inside `trackRound` on the fresh-record write only (idempotent across re-scans; chain-seconds windows × 1000 → trace ms). `evidence` after intake from the new `DutyIntake { context, files }` — `assembleDutyContext` now returns a manifest (path + sha256 over the decrypted plaintext + byte size; content never leaves the process). `verdict` right after the agent settles (`unsealAt = round.revealEnd × 1000`; open-mode strip stays sink-side, one enforcement point). `commit` after commitVote (`{tx?, dryRun}`), `reveal` on a real reveal tx, `abstain` inside `abstain()` after the durable mark, before the alert.
- Agent events: `runVerdictPipeline` sets `AgentContext.trace = (ev) => sink.emit(ev)` so the runner's agent-start/step tap flows through the same per-duty sink.
- `main.ts` wires `makeTraceSinkBinder` from `config.trace` (juror = chain.address, seed via new `hotKeySeed()` helper extracted in chain/client.ts — boot-loud on wrong-size keys, shared with the evidence signMessage seam).
- Tests (RED→GREEN, fake sink): full duty emits duty-open → evidence → agent-start → step → verdict(unsealAt) → commit in order; duty-open never re-emits on re-scan; DRY_RUN emits commit{dryRun:true} (no tx); ladder-exhausted emits abstain{failure, reason}; reveal phase emits reveal{tx}; dead trace endpoint (real sink → 127.0.0.1:1) never fails the duty. evidence.test.ts extended with the manifest assertions (sha256 oracle over plaintext).
- SPEC: trace row marked landed, failure-modes row added. Changeset added.
- Verification: `bun test` 198 pass / 0 fail, `tsc --noEmit` clean, `eslint` clean in @useaccord/jurat.
