---
# accord-9t95
title: Implement event subscriber
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T16:00:38Z
parent: accord-mwfq
blocked_by:
  - accord-h1v2
---

---

assigned: implementer
---

src/chain/events.ts: subscribe DisputeCreated/JurorsDrawn/RulingFinalized as indexing + retention hints (cache only; reader is source of truth).

See milestone accord-yjno HANDOFF §1 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

- `apps/evidence-daemon/src/chain/events.ts` — off-chain event subscriber.
  Decodes the three Anchor events the daemon tracks from transaction logs and
  dispatches them as best-effort **hints**:
  - `DisputeCreated` → indexing wake-up; `JurorsDrawn` → deliverability cache
    hint; `RulingFinalized` → retention sweep trigger.
  - Pure, side-effect-free decoders: `decodeAccordEvent(record)` (discriminator
    dispatch over `sha256("event:<Name>")[0..8]`), `parseAccordLog(line)`
    (`Program data: <base64>` → typed event), `parseAccordLogs(logs)`.
  - `subscribeAccordEvents(rpcSubscriptions, programId, handlers, signal)`
    wires the decoders to a Kit `logsNotifications({ mentions: [programId] })`
    websocket stream and routes each typed event to its handler.
  - **Cache-only contract enforced in docs + code:** the `JurorsDrawn.jurors`
    list is a convenience hint; delivery still re-reads the authoritative
    `Round.jurors[]` via the reader. Decode/handler failures never throw — a
    missed hint is a no-op, the reader remains the source of truth.
  - Built with Kit codecs mirroring the on-chain borsh layout
    (`programs/accord/src/events.rs`): `getStructDecoder` + `getAddressDecoder`
    - `getU32Decoder` (LE) + `getArrayDecoder` (u32 Vec prefix) +
      `fixDecoderSize(getBytesDecoder(), 32)` for the 32-byte VRF seed.
- `apps/evidence-daemon/tests/events.selfcheck.ts` — runnable self-check
  (10 cases, `node --test`): round-trips all three events, unknown/too-short/
  malformed records → null without throwing, `Program data:` parsing, malformed
  base64 tolerance, multi-event-in-order. Excluded from the tsc build (outside
  `src/`); run with `node --test apps/evidence-daemon/tests/events.selfcheck.ts`.

**Verification.**

- `pnpm --filter @accord/evidence-daemon run lint` — clean.
- `pnpm --filter @accord/evidence-daemon run build` — clean (events.{js,d.ts} emitted; test file not in `dist/`).
- `node --test apps/evidence-daemon/tests/events.selfcheck.ts` — 10/10 pass.
- `pnpm --filter @accord/sdk run build && lint` — clean (no cross-package regression).
