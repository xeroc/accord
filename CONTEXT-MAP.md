# VeriDAO

VeriDAO is a Solana platform with two programs: a **Schelling-point arbitration accord** (the standalone primitive) and a **permissionless mutual DAO factory** that uses the accord for claims adjudication. The name fuses *veritas* (truth) and *DAO* — a decentralized organization built on the principle that truth emerges from independent convergence.

## Contexts

- **[Accord](./PROJECT.md)** — the arbitration program: subaccords, jurors, disputes, commit-reveal voting, coherence incentives. Standalone, general-purpose. Any Solana program can file disputes.
- **[Mutual](./MUTUAL.md)** — the mutual DAO factory: single-purpose mutuals, premium/reserve funds, tenure-based coverage. Uses the Accord for claim adjudication.

## Relationship

- **Mutual → Accord**: when a Claim is filed, the Mutual program files a **Dispute** with the Accord via CPI. The Accord adjudicates and writes a **Ruling**. The Mutual program reads the Ruling and pays or denies the Claim. The Accord has no knowledge of mutuals — it is a general-purpose arbitration primitive.
