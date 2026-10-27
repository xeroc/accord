---
"@useaccord/cranker": patch
---

Readable failure logs. The cranker no longer emits `SolanaError: Solana error #-32002; Decode this error by running npx @solana/errors decode … '<base58 blob>'`: the service neutralises `@solana/errors` v7's production-mode message stripping at boot (the Docker image sets `NODE_ENV=production`), and simulation/on-chain failures now lead with the actual program reason parsed from the validator logs (`AnchorError … Error Code: Xxx … Error Message: …`, panics, or `custom program error: 0xNN`). Every crank and tx log line — including failures — is tagged with the subaccord (and dispute/item/case) it belongs to, and a failing crank action is logged and skipped instead of aborting the whole reconcile cycle, so one stuck account can no longer starve the rest of the cycle.
