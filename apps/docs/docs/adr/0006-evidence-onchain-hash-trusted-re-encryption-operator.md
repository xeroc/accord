# Evidence — on-chain commitment hash only; off-chain re-encryption by a designated operator

The Accord stores only an `evidence_hash` on-chain. Claimants encrypt evidence for a Subaccord-designated Evidence Operator, which runs an open-source off-chain service that re-encrypts the evidence for the drawn Jurors (optionally watermarked for leak attribution). Jurors verify cleartext against the on-chain hash. Arcium MPC was evaluated for this layer and rejected: evidence is large blobs (wrong shape for MPC, which operates on fixed-size scalars), the claimant legitimately already holds the evidence key so trustless sealing adds no security over standard asymmetric encryption, and subjective adjudication requires Jurors to see the evidence — at odds with encrypted-compute.

## Considered Options

- **Arcium MPC sealing (was the v2 plan in BEAN-6):** rejected for the three reasons above. Arcium's genuine fit for Accord is encrypted vote-tallying (Juror vote privacy) — a separate v2/v3 mechanism, not the evidence layer.

## Consequences

- The Evidence Operator is a trusted component: it sees plaintext and could leak. Mitigated by open-source code, operator attributability, and per-Juror watermarking. Content integrity remains on-chain (the hash).
- BEAN-6 reframed: v1 evidence = this trusted-operator model; Arcium is no longer the evidence path.
- The Accord's on-chain surface for evidence never grows beyond the hash — a clean upgrade target if a trustless delivery mechanism matures.
