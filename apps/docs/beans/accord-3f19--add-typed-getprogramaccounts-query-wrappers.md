---
# accord-3f19
title: Add typed getProgramAccounts query wrappers
status: completed
type: task
created_at: 2026-08-07T23:08:48Z
updated_at: 2026-08-08T00:00:00Z
parent: accord-mpjd
---

Add SDK functions that encapsulate discriminator + memcmp offset construction: findAllSubaccords(rpc), findJurorStakesBySubaccord(rpc, subaccord), findDisputesBySubaccord(rpc, subaccord), findJurorStakesByJuror(rpc, juror), findDisputesByFiler(rpc, filer). Each returns typed Account<T>[]. No raw bytes leak to the caller.

## Summary of Changes

Added `packages/sdk/src/query.ts` — five typed `getProgramAccounts` wrappers
that hide discriminator + memcmp-offset construction behind a `Rpc<
GetProgramAccountsApi>` surface:

- `findAllSubaccords(rpc)` — discriminator-only filter (`SUBACCORD_DISCRIMINATOR` @0).
- `findJurorStakesBySubaccord(rpc, subaccord)` — disc + subaccord @8.
- `findJurorStakesByJuror(rpc, juror)` — disc + juror @40.
- `findDisputesBySubaccord(rpc, subaccord)` — disc + subaccord @8.
- `findDisputesByFiler(rpc, filer)` — disc + filer @40.

Each returns fully decoded `Account<T>[]`; no raw bytes, memcmp offsets, or
decoders leak to the caller. Offsets (8 / 40) are fixed by the generated
struct layouts (`disc(8) | addr(32) | addr(32)` prefix shared by JurorStake +
Dispute) and documented inline; a `query.test.ts` round-trip through the
generated encoder fails if they drift.

Implementation notes:

- Pattern mirrors the canonical `@solana/kit` GPA approach (orca/whirlpools
  `fetchDecodedProgramAccounts`): base64-encoded GPA response → `getBase64Encoder`
  → generated `getXDecoder().decode()`.
- Kit v7: base58 decoder yields plain `string` (cast `as Base58EncodedBytes`
  for the filter `bytes` field); decoders accept `ReadonlyUint8Array | Uint8Array`.
- Exported from `index.ts`.

Verification: `pnpm --filter @useaccord/sdk run lint` clean; `query.test.ts`
green (offsets verified against the encoded JurorStake struct). The 2 pre-existing
`staking.test.ts` failures are unrelated to this change (untouched file).
