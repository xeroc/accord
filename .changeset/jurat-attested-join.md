---
"@useaccord/jurat": minor
---

Attestation-aware joining (ADR-0024 / PROG-ATTESTATION): the join executor no longer blanket-rejects credential-gated Subaccords. Gated pools resolve the juror's SAS attestation via `findSasAttestation` (credential+schema+subject memcmp) and thread it into the `stake` instruction; a gated pool with no matching attestation is rejected `AttestationGated` — no join. The lookup sits after on-chain idempotency so an already-joined pool never pays it. Scan iterations also recognize the juror's own on-chain JurorStake now: `reconcile` drops already-staked pools from `joinCandidates` and reports them as `heldStakes`, and the runtime heals the joined book from that — budgets count real on-chain exposure even after a wiped state dir or a manual stake (beans accord-pph6).
