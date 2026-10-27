---
# accord-bm16
title: Juror browse table + per-juror detail page with SAS attestation
status: completed
type: feature
priority: normal
created_at: 2026-10-12T10:15:41Z
updated_at: 2026-10-12T10:55:12Z
---

## Summary of Changes

- **SDK (`packages/sdk/src/sas.ts` + `sas.test.ts`, exported via `index.ts`)**: `SAS_PROGRAM_ID` (pinned), `decodeSasAttestation` (byte-mirror of `sas_layout` in `programs/accord/src/attestation.rs` — dynamic expiry offset after the variable data blob), `findSasAttestations(rpc, {wallet?, credential?, schema?})` gpa wrapper with fixed-offset memcmp filters; malformed foreign accounts skipped, not thrown. `addressFilter` exported from `query.ts` for reuse. 7 decoder tests (dynamic offset across data_len 32/48/100/256, never-expires, bad disc, short account, sub-wallet data_len, truncated tail).
- **App matching (`apps/app/src/features/juror/sas.ts` + test)**: `isGated` / `satisfiesGate` / `attachAttestations` / `isShieldedJuror` / `expiryState` — pure join of attestations against gated Subaccord bindings. 7 tests incl. fractional-`Date.now()` regression (BigInt RangeError crash found in browser verification, fixed with `Math.floor`).
- **`/juror/browse` (JurorBrowsePage)**: rewritten from card grid to a simple table — Juror (link to detail, copyable) | Credential (🛡️ or —) | Subaccords | Active draws | Staked by mint | Fees by mint. SAS scan is non-fatal (muted note if the cluster blocks it).
- **`/juror/:address` (new JurorDetailPage + route)**: stakes table (subaccord link, credential state incl. "none" badge for gated pool without satisfying attestation, staked, draws, fees, pending withdrawal) + SAS attestation cards (account, credential, schema, signer, nonce, expiry with never/valid/expired badge, unlocked subaccord links). Route registered in App.tsx.
- **Changeset**: `.changeset/sas-juror-shields.md` (sdk + app, minor).

## Verification

- `pnpm --filter @useaccord/sdk lint/test/build` green (62 pass); `pnpm --filter @useaccord/app lint/test/build` green (62 pass).
- Live Surfnet (runbook-deployed programs) + `attestation.spec.ts` seeded: gated subaccords, a shielded juror (never-expire att), a pruned juror (expired att, pending withdrawal banked).
- Browser-verified `/juror/browse` (table + 🛡️ on both shielded jurors) and `/juror/:address` (both juror shapes; expired-attestation card + pending-withdrawal row). Unfiltered SAS gpa against the mainnet-datasource Surfnet decoded ~12k real attestations cleanly — layout validated against live mainnet data.
