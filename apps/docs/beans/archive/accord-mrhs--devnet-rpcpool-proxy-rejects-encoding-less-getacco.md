---
# accord-mrhs
title: Devnet rpcpool proxy rejects encoding-less getAccountInfo
status: completed
type: bug
created_at: 2026-10-27T08:59:32Z
updated_at: 2026-10-27T08:59:32Z
---

Regression from the armed-loop tokenBalance fix (accord-6s0w): the ATA existence probe called getAccountInfo(ata) with NO encoding config; the devnet rpcpool.com proxy rejects certain base58 address strings in that shape with 'Encoded binary (base 58) data should be less than 128 bytes, please use Base64 encoding' — deterministic per address. Fixed: explicit { encoding: 'base64' } (matches the existing client.ts Clock-sysvar pattern) in main.ts + the e2e seam. Verified: all 26 devnet subaccords probe clean; bun 202/202; e2e armed loop green.
