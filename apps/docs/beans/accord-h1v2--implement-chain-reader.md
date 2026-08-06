---
# accord-h1v2
title: Implement chain reader
status: todo
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-06T20:30:33Z
parent: accord-mwfq
---

---

assigned: implementer

---

src/chain/reader.ts via @accord/sdk: read Subaccord (evidence_operator/evidence_spec), Dispute (evidence_hash/state), Round (jurors[]). Helpers: isDrawn(dispute,juror), isDeliverable(dispute). Round account is authoritative.

See milestone accord-yjno HANDOFF §1 §2 for the shared contract (data types, crypto, edge cases, DoD).

## READ PATH — do NOT use the facade's fetchX (they break)

The SDK's typed fetchers (`fetchSubaccord`/`fetchDispute`/`fetchRound` in `packages/sdk/src/fetch.ts`) require a `ClientWithRpc` and **break over a raw `createSolanaRpc`** — see the caveat in `packages/sdk/src/index.ts:111-114`. The daemon builds its own RPC client, so the facade fetchers will throw.

Use the proven read pattern from `tests/src/setup/assertions.ts:26`:

```ts
import {
  getSubaccordDecoder,
  getDisputeDecoder,
  getRoundDecoder,
} from "@accord/sdk";

async function readDecoded<T>(
  rpc,
  pda: Address,
  dec: Decoder<T>,
): Promise<T | null> {
  const acc = await rpc.getAccountInfo(pda, { encoding: "base64" }).send();
  if (!acc.value) return null;
  const bytes = new Uint8Array(Buffer.from(acc.value.data[0], "base64"));
  return dec.decode(bytes);
}
```

The decoders (`getSubaccordDecoder`, `getDisputeDecoder`, `getRoundDecoder`) are exported from `@accord/sdk` (index.ts:115-123). Pass raw base64 bytes; they handle the discriminator.

## Fields needed

- `Subaccord.evidence_operator` -> keyring lookup (`forOperator`)
- `Dispute.subaccord`, `Dispute.evidence_hash`, `Dispute.state` -> integrity gate + delivery gate
- `Round.jurors[]` (for `Dispute.currentRound`) -> **authoritative** drawn-set membership check
- `Round` PDA: `findRoundPda({ dispute, roundIdx })` from `@accord/sdk` (hand-written, not generated)

`isDrawn(dispute, juror)`: read Round for `dispute.currentRound`, return juror in `round.jurors[]`.
`isDeliverable(dispute)`: `dispute.state >= Drawn` (DisputeState enum ordering).
