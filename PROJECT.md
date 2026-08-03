# VeriDAO Accord — Project Rationale

## Why

Subjective disputes are everywhere: "was this car accident covered?", "did the freelancer deliver?", "is this NFT authentic?", "was this protocol exploit in scope?". Smart contracts can't adjudicate these — they require judgment.

On Ethereum, Kleros solved this: a Schelling-point-based decentralized accord where random stake-weighted jurors vote honestly because coherence (voting with the majority) is the profitable strategy. It's live since 2019, 1000+ disputes settled.

**Solana has no equivalent.** Dispute resolution on Solana is either centralized (trusted multisig committees), absent, or an unaudited cross-chain port. There is no native Schelling-point arbitration primitive that any Solana program can use.

Meanwhile, the demand for trustless adjudication is growing: DeFi insurance, freelancing escrows, DAO governance disputes, curated lists, prediction-market oracles. Every one of these needs a "who is right?" mechanism that doesn't trust a central party.

## What

**VeriDAO Accord** is a general-purpose, Schelling-point-based decentralized arbitration accord on Solana. Any Solana program can file disputes; the Accord draws jurors, collects commit-reveal votes, and emits rulings — all governed by game-theoretic incentives, not trusted humans.

### Core mechanism

```
1. A program files a Dispute (via CPI): subaccord, options, evidence hash, fee
2. The Accord randomly draws N Jurors from the Subaccord (Switchboard VRF, weighted by stake)
3. Drawn Jurors review encrypted evidence (accessible only to them)
4. Each Juror Commits hash(vote, salt) — secret, prevents vote-copying
5. After all Commits, Jurors Reveal {vote, salt}
6. Majority wins → Ruling
   - Coherent Jurors earn fees + slashed stake from Incoherent Jurors
   - Incoherent Jurors lose a fraction of their stake
7. Losing party can Appeal → 2N+1 Jurors (exponential cost → bribery-prohibitively-expensive)
```

### Key properties

- **Schelling Point = honesty.** Jurors converge on the truthful answer because voting coherently with the group is the profitable strategy. No central authority picks judges.
- **Subaccords.** Specialized juror pools (automotive, dental, freelancing, NFTs). Jurors self-select by expertise. Permissionless creation — anyone can register a Subaccord.
- **Per-Subaccord staking token.** Each Subaccord defines which SPL token Jurors stake (USDC by default; any token). The stake is the anti-sybil mechanism and the coherence-slashing substrate.
- **Arbitrable interface.** Any Solana program can use the Accord: `create_dispute()` → `get_ruling()`. Two CPI calls. The Accord has no knowledge of the filing program's domain.
- **Commit-reveal voting.** Prevents vote-copying, which is what makes the Schelling Point form independently. Without secret votes, Jurors would copy the majority instead of reasoning.
- **Exponential appeals.** Each appeal doubles the jury + 1 (3 → 7 → 15 → 31). Makes bribery exponentially expensive — the core anti-attack mechanism from Kleros.

### Why this is a standalone product

The Accord doesn't depend on any specific application. It's a general-purpose primitive — the "Kleros of Solana." Any program that needs subjective dispute resolution can use it:

| Use case | Dispute example |
|---|---|
| Freelancing escrow | "Did the developer deliver as specified?" |
| NFT authenticity | "Is this token an authentic original?" |
| Curated lists | "Does this token belong on the whitelist?" |
| DAO governance | "Was this proposal executed correctly?" |
| Prediction markets | "Did the event resolve YES or NO?" |

The Accord ships first and proves the Schelling mechanism on Solana; client programs plug in on top via the Arbitrable CPI.

### What this is NOT

- Not an oracle (it doesn't provide data feeds — it adjudicates subjective questions)
- Not a governance system (it resolves disputes, it doesn't set policy)
- Not Kleros (it's a new Solana-native implementation with Switchboard VRF, per-Subaccord tokens, and the Arbitrable CPI interface)
