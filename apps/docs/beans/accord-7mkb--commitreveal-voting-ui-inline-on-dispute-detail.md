---
# accord-7mkb
title: Commit/reveal voting UI (inline on dispute detail)
status: completed
type: task
priority: normal
created_at: 2026-08-07T23:09:16Z
updated_at: 2026-08-08T23:18:56Z
parent: accord-pbff
blocked_by:
  - accord-ewj8
---

Rendered inline on /disputes/:address when juror pubkey is in Round.jurors[]. Fetch round via findRoundPda + fetchRound. If state=Commit: show option index selector (0..numOptions-1) + auto-generate 32-byte salt. Call accord.methods.commit(accounts, {vote, salt}) — SDK computes sha256(vote||salt||juror). If state=Reveal: show reveal form with stored {vote, salt}. Call accord.methods.reveal(accounts, args). Store salt in localStorage keyed by dispute+round+juror (needed between commit and reveal).

## Summary of Changes

- **Voting.tsx** (new): inline commit/reveal voting component rendered on the dispute detail page. Phase detection via `DisputeState.Commit` / `DisputeState.Reveal` enum. Juror eligibility check against `round.jurors[0..jurorCount-1]`. Auto-generates 32-byte salt (`crypto.getRandomValues`) at mount; stores `{vote, salt}` in `localStorage` keyed by `accord:vote:<dispute>:<roundIdx>:<juror>` — survives page reload between commit and reveal windows. Commit form shows option selector (`0..numOptions-1`) + option hash preview. Reveal form reads stored `{vote, salt}` and shows the stored vote index. Seat/commit/reveal status badges from round data. Commit + reveal fully wired through the SDK facade (`env.accord.methods.commit/reveal`) and `sendInstruction` (ConnectorKit signer from `useAccord()`). Verified: `tsc -b` green.
- **DisputeDetail.tsx**: replaced the voting placeholder with `<Voting dispute={dispute} round={round} />`, gated on `round.data.jurorCount > 0` (was `jurors.length > 0` which is always true for the fixed 31-element array).
