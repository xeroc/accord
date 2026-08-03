# VeriDAO

VeriDAO is a Solana platform with two programs: a **Schelling-point arbitration court** (the standalone primitive) and a **permissionless mutual DAO factory** that uses the court for claims adjudication. The name fuses *veritas* (truth) and *DAO* — a decentralized organization built on the principle that truth emerges from independent convergence.

## Contexts

- **[Court](./PROJECT.md)** — the arbitration program: subcourts, jurors, disputes, commit-reveal voting, coherence incentives. Standalone, general-purpose. Any Solana program can file disputes.
- **[Mutual](./MUTUAL.md)** — the mutual DAO factory: single-purpose mutuals, premium/reserve funds, tenure-based coverage. Uses the Court for claim adjudication.

## Relationship

- **Mutual → Court**: when a Claim is filed, the Mutual program files a **Dispute** with the Court via CPI. The Court adjudicates and writes a **Ruling**. The Mutual program reads the Ruling and pays or denies the Claim. The Court has no knowledge of mutuals — it is a general-purpose arbitration primitive.
