---
"@useaccord/sdk": minor
"@useaccord/app": minor
---

SAS jurors: juror browse is now a simple table with a 🛡️ shield marking jurors whose SAS attestation satisfies a gated subaccord they stake in, plus a new `/juror/:address` juror detail page (per-subaccord stakes table, full SAS attestation cards: credential, schema, signer, nonce, expiry state, unlocked subaccords). The SDK gains a `sas` module — `SAS_PROGRAM_ID`, the ADR-0024 attestation decoder (byte-mirror of the on-chain `sas_layout`), and `findSasAttestations` (getProgramAccounts over the SAS program with fixed-offset credential/schema/wallet memcmp filters).
