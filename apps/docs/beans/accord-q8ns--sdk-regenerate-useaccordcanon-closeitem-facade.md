---
# accord-q8ns
title: SDK — regenerate @useaccord/canon + closeItem facade
status: completed
type: task
priority: normal
created_at: 2026-08-14T19:06:45Z
updated_at: 2026-08-19T00:00:00Z
parent: accord-xztg
blocked_by:
  - accord-kmz6
---

---

assigned: implementer

---

After the program change lands: regenerate the Codama client (`make codegen` — canon has its own `codama.json` under `packages/canon`), add a `closeItem` facade method mirroring the existing facade method shape, reusing the existing canon-item PDA helper. Grep `close_item|closeItem` across `apps/` and `tests/` for consumers needing migration (expected: none besides new specs). Never hand-edit `src/generated/`.

## Acceptance criteria

- [x] regenerated client contains `close_item` (committed, not hand-edited)
- [x] `closeItem` exported from the `@useaccord/canon` public surface
- [x] `make codegen && pnpm -r run build` green workspace-wide
- [x] `pnpm --filter @useaccord/canon lint` green (where defined)

## Summary of Changes

- `anchor build -p canon --ignore-keys` (avm 1.0.2) emitted the fresh IDL with `close_item`, then `pnpm exec codama run js` in `packages/canon` regenerated the client: new `generated/instructions/closeItem.ts`, `NotRemoved` (0x1786) + `StakeOutstanding` (0x1787) errors, program registration.
- Regeneration also caught canon's generated `Dispute` type up to the accord program's H-2 `drawnSeats` field (security fix 02e52ca) — canon's generated output had been stale; codecs updated, offsets unchanged (carved from padding).
- `packages/canon/src/methods.ts`: new `closeItem(accounts: { caller: TransactionSigner; item: Address })` facade mirroring `advancePending`'s minimal shape — the PDA is self-seeded on-chain so no derivation needed; consumers holding seeds use the existing exported `findCanonItemPda`.
- `packages/canon/src/index.ts`: `closeItem` + `CloseItemAccounts` on the public surface; doc header updated to "eight v1 instructions".
- Grepped `close_item|closeItem` across `apps/` and `tests/` — no consumers to migrate (e2e + cranker beans downstream).
- Verified: `pnpm -r run build` green workspace-wide, `pnpm -r run lint` green, `@useaccord/canon` tests 2/2 pass.
