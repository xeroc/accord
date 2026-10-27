---
# accord-h1v2
title: Implement chain reader
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T15:10:01Z
parent: accord-mwfq
---

---

assigned: implementer
---

src/chain/reader.ts via @accord/sdk: read Subaccord (evidence_operator/evidence_spec), Dispute (evidence_hash/state), Round (jurors[]). Helpers: isDrawn(dispute,juror), isDeliverable(dispute). Round account is authoritative.

See milestone accord-yjno HANDOFF §1 §2 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

Implemented `apps/evidence-daemon/src/chain/reader.ts` — a read-only facade
over `@accord/sdk` exposing the three on-chain views the daemon gates every
request on, plus two delivery helpers:

- `readSubaccord(accord, subaccord)` → `{ evidenceOperator, evidenceSpec } | null`
- `readDispute(accord, dispute)` → `{ subaccord, evidenceHash, state, currentRound } | null`
- `readRound(accord, dispute, roundIdx)` → `{ roundIdx, jurorCount, jurors } | null`
  (derives the `["round", dispute, u32_le(roundIdx)]` PDA, fetches the
  authoritative drawn set)
- `isDrawn(round, juror)` — Round-membership bounded by `jurorCount` (the
  fixed-31 array's tail is zero-pubkey padding)
- `isDeliverable(dispute)` — `state >= DisputeState.Drawn`

Signature note: `isDrawn` takes the `RoundView`, not the `DisputeView` — a
Dispute carries no jurors and the Round account is authoritative (HANDOFF §4:
`Round.jurors[].contains(juror)`). The delivery pipeline composes both views:
`isDeliverable(dispute) && isDrawn(round, juror)`.

**Enabling SDK fix (1 char).** The reader (and the upcoming tester fixtures)
need `DisputeState.Drawn` as a runtime value, but `packages/sdk/src/types.ts`
re-exported the enum **type-only** (`export { type DisputeState, ... }`),
making any value use fail (`TS1362`). Changed to a value export
(`export { DisputeState, ... }`) — strictly additive; the enum is a real
runtime value and this is the correct public API. SDK lint clean, all 43 SDK
tests still pass.

**Bugs fixed in the reader draft.** `readRound` used `pda.address`, but Kit's
`ProgramDerivedAddress` is a tuple `readonly [Address, bump]`; switched to
tuple destructure (`const [roundAddress] = await findRoundPda(...)`) per
Kit's own docs.

**Verification.**

- `pnpm --filter @accord/evidence-daemon run lint` (tsc --noEmit, strict +
  noUncheckedIndexedAccess): clean.
- `pnpm --filter @accord/evidence-daemon run build`: clean.
- `pnpm --filter @accord/sdk run lint` + `run test`: clean, 43/43 pass.

Tests for the reader live in the sibling bean accord-lrap (Test chain reader).
