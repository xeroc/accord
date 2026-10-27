---
# accord-929i
title: Review chain-reader
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T16:19:33Z
parent: accord-mwfq
blocked_by:
  - accord-lrap
---

---

assigned: reviewer
---

Verify Round is authoritative (not event cache), state gates correct, no on-chain writes.

See milestone accord-yjno HANDOFF §3 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

Read-only audit of `apps/evidence-daemon/src/chain/{reader,events}.ts` against
the three review criteria. **Verdict: PASS on all three. No bugs found, no
code changes, no draft beans.**

**1. Round is authoritative (not event cache) — PASS.**

- `isDrawn(round: RoundView, juror)` consumes only the live `Round` account
  view: it iterates exactly `[0, round.jurorCount)` of the fixed-31 `jurors`
  array and matches membership there. It never reads any event-derived cache.
- `events.ts` `subscribeAccordEvents` only dispatches best-effort typed hints
  to caller-provided handlers; it mutates no gate and returns no delivery
  decision. `JurorsDrawnEvent.jurors` is documented (interface + module
  header) as "never the membership gate"; the authoritative re-read of
  `Round.jurors[]` is the contract the future pipeline must honour.
- No delivery code exists yet (only `chain/` is built; `pipeline/deliver.ts`
  is unwritten), so there is no current path that could misuse an event list.
  The HANDOFF §4 gate — `isDeliverable(dispute) && isDrawn(round, juror)` —
  is exercised over reader views in `reader.test.ts` ("composition"), which
  independently confirms a non-drawn juror fails even when deliverable.

**2. State gates correct — PASS.**

- `isDeliverable(dispute) = dispute.state >= DisputeState.Drawn`. Verified
  `DisputeState.Drawn = 2` and the enum is monotone along the lifecycle
  (Created=0 … Closed=8), so `>=` is the correct comparison and matches
  HANDOFF §4 (`require ... state >= Drawn`).
- No upper bound by design: the reader docstring states retention cleanup
  post-`Final` is the store layer's concern, not the reader's — consistent
  with the HANDOFF. `reader.test.ts` pins premature states (Created,
  SnapshotPosted → not deliverable; the daemon 404s a pre-draw GET, HANDOFF
  §6) and every state `>= Drawn` (Review…Closed → deliverable).

**3. No on-chain writes — PASS.**

- The daemon `src/` contains only `chain/reader.ts` and `chain/events.ts`
  (no other modules exist yet).
- `reader.ts` imports `fetchDisputeMaybe` / `fetchRoundMaybe` /
  `fetchSubaccordMaybe` (SDK read fetchers) + `findRoundPda` (pure PDA
  derivation) + `DisputeState` (runtime enum). No instruction, send, sign,
  transfer, or SystemProgram paths.
- `events.ts` imports only Kit codecs + subscription types; its sole chain
  surface is `logsNotifications({ mentions: [programId] }).subscribe(...)`,
  a read-only websocket log subscription. A repo-wide grep for
  `send|sign|Instruction|transfer|SystemProgram|invoke|requestAirdrop` over
  `apps/evidence-daemon/src/` matched only comment prose — no call sites.

**Bonus verifications (independent recomputation, not trusting the source).**

- Event discriminators: recomputed `sha256("event:<Name>")[0..8]` for all
  three names — byte-exact match to the constants embedded in `events.ts`
  (`feca337b…` / `98694ae2…` / `bf58c23f…`).
- Borsh field order: each decoder's struct layout matches the corresponding
  `#[event]` declaration in `programs/accord/src/events.rs` (DisputeCreated
  dispute/subaccord/filer/num_options; JurorsDrawn
  dispute/round_idx/jurors/vrf_seed; RulingFinalized dispute/ruling).

**Verification.**

- `pnpm --filter @accord/evidence-daemon run test` — 25/25 pass.
- `pnpm --filter @accord/evidence-daemon run lint` — clean.
- No code modified by this review (read-only); this commit records the verdict only.
