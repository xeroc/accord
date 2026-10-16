---
"@useaccord/sdk": patch
"@useaccord/cli": patch
"@useaccord/cranker": patch
"@useaccord/tests": patch
---

SAS attestation threading for `draw_seat` clients + a meaningful gate error. The on-chain defense-in-depth re-check (PROG-ATTESTTION) required the juror's SAS attestation as `remaining_accounts[1]` on gated pools, but no client ever passed it — every gated draw reverted the red-herring `InvalidPanelSize`. The gated branch of the count check now reuses `AttestationMissing` (ungated stays `InvalidPanelSize`). SDK `drawSeat`/`buildDrawSeat` gain an optional `attestation` (read-only remaining account); new `findSasAttestation` query discovers an attestation by content (credential+schema+wallet memcmp over the SAS program); `draw:seat --attestation` forwards it explicitly, `draw:submit-panel` and the cranker's draw_seat crank resolve it per seat automatically and skip/abort with a clear remediation message when missing.

Follow-ups from the first devnet run: `findSasAttestation` dropped its exact `dataSize: 173` filter — real SAS accounts run 205 bytes (32 trailing bytes past expiry) and RPC `dataSize` is an exact match, which silently excluded every live attestation; the three memcmp filters alone are the discovery contract. The SDK's hand-maintained `AccordErrors` map is regenerated from the IDL and bound to the generated `ACCORD_ERROR__*` constants (it ran 24 variants short and misnamed codes — 6027 InvalidPanelSize surfaced as "CommitAlreadyExists"); `errors.test.ts` pins the binding. `draw:submit-panel` gains `--from-seat` to resume partially-drawn panels (draw_seat enforces sequential seats). The SDK test glob is quoted so Node expands it — root-level test files (`accord`, `errors`, `query`) were silently skipped by the shell glob; `query.test.ts` had rotted and is repaired to the current JurorStake layout.
