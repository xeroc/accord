# Schelling-point Accord replaces hired-judge committee

Disputes are adjudicated by the VeriDAO Accord (random stake-weighted Jurors, commit-reveal, coherence incentives) — NOT by a curated hired-judge committee. Every Dispute routes to the Accord.

## Considered Options

- **Hired judge committee** (3–5 named, vetted judges, all review each Dispute, majority vote): simpler, lower PII exposure (only named judges see evidence), proven by Nexus Mutual. But centralized (a trust/collusion point), lower throughput (judges are a bottleneck), and adds no value over the Schelling mechanism for honest adjudication.
- **Hybrid** (hired judges for first-pass, Accord for appeals only): preserves PII containment for routine Disputes. Rejected because the Accord is built first as a standalone product — requiring hired judges before the Accord exists inverts the build order. Also: maintaining two adjudication systems is more complex than one.

## Consequences

- Every Dispute's evidence reaches random drawn Jurors (larger PII surface than a named committee). Mitigated by: Jurors are staked/accountable (eventually KYC'd), evidence is encrypted and accessible only to drawn Jurors (not the general public), and a future "anonymity filter dimension" can require identity-verified Jurors for sensitive Subaccords.
- The Schelling Point (honesty equilibrium) must hold for subjective disputes. Kleros proves it works for subjective disputes; we accept it may be less reliable than human experts on edge cases.
- No hired-judge infrastructure to build, maintain, or govern. One adjudication system.
