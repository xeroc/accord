# VeriDAO Mutual — Project Rationale

## Why "Mutual", not "Insurance"

What we build is a **discretionary mutual**, not licensed insurance. The distinction matters legally, structurally, and in how the product is communicated:

| | Licensed Insurance | Discretionary Mutual (what we build) |
|---|---|---|
| Payout obligation | **Contractual** — the insurer must pay valid claims | **Discretionary** — the pool *may* pay; the Accord can deny |
| Regulatory status | Licensed, regulated, solvency-overseen | Unlicensed (arguably) — no binding indemnity contract |
| Capital requirements | Regulator-mandated minimums | DAO-governed MCR gate |
| The word itself | Heavily regulated in most jurisdictions | Not a regulated term |

Calling our product "insurance" would be legally inaccurate (it isn't licensed), regulatorily risky (the word "insurance" invites regulatory scrutiny), and structurally dishonest (payouts are at the pool's discretion, not contractual). **"Mutual" accurately describes the risk-pooling structure, avoids the regulated word, and matches the proven crypto template** — Nexus Mutual has operated this way since 2019 at $82M TVL without an insurance license.

We use "insurance" only when referring to the existing licensed-insurance sector as a market reference (e.g., "the on-chain insurance sector holds ~$97M TVL") — never to describe our own product.

## Why build this

The decentralized on-chain insurance sector has failed to scale. After 7+ years and 28 protocols, the entire sector holds ~$97M TVL. Nexus Mutual alone holds 85%. The rest are dormant or dead.

Three structural reasons killed every attempt:

1. **Capital inefficiency.** Over-collateralized pools hold enough to pay every simultaneous claim. Most capital sits idle → yield is uncompetitive → capital flight → death spiral. Bridge Mutual needed $500M; peaked at $150M.

2. **Adjudication was centralized or absent.** Every live protocol either uses a trusted committee (Nexus Mutual's 3-person Claims Committee) or public token-voting (which is slow, gameable, and exposes claimant PII to the entire voter base). Nobody built trustless, privacy-preserving claims adjudication.

3. **"Cover anything" was tried as a single pool.** Single pools covering arbitrary risk die on adverse selection + moral hazard + un-correlated risk. The viable shape is per-risk-type isolation, not one shared pool.

**Meanwhile on Solana:** the surface is wide open. Amulet (AmuShield) is the only purpose-built Solana-native player, and it's a broad DeFi hub with negligible cover-specific TVL. There is no permissionless mutual DAO factory, no trustless claims adjudication, no privacy-preserving evidence pipeline.

## What

**VeriDAO Mutual** is a factory of single-purpose Mutuals on Solana. Each Mutual covers exactly one real-world risk type (car accidents, dental problems, drug-raid legal defense — anything the Founder defines). Each Mutual is sovereign: its own funds, its own policies, its own Subaccord. The factory provides the shared infrastructure (fund management, premium payments, settlement, coverage logic); each Mutual configures its own parameters.

### The two-program architecture

```
VeriDAO Accord (program B — built first)
     ↑
     │ files Disputes, reads Rulings
     │
VeriDAO Mutual (program A — built second)
     │
     └── reads premium payment system (rail TBD — see BEAN-5)

The Mutual program is a **client** of the Accord. When an Insured files a Claim, the Mutual program files a Dispute with the Accord ("should this claim be approved?"). The Accord adjudicates via the Schelling mechanism. The Mutual program reads the Ruling and pays or denies.

### Capital model

Two-tier funds per Mutual:

- **Premium Fund** — current-period Premiums. First-loss. Claims draw from it first. Resets each Settlement.
- **Reserve Fund** — Staker capital + retained surplus. Backstop. Only drawn when the Premium Fund is exhausted. Drawing from it slashes all Staker Positions pro-rata.

Settlement (period close): if Premiums > Claims, the Surplus splits into retained reserve (grows the Reserve Fund), Staker yield (pro-rata by stake-seconds), and Insured refund (pro-rata by Premiums paid). If Claims > Premiums, Stakers already absorbed the loss — no distribution.

### Coverage model

**Bounded tenure-based coverage.** Coverage grows with how long the Insured has been paying Premiums:

```

Month 0–1:   Waiting Period (no coverage — anti-fraud)
Month 2:     base coverage (e.g. 1,000 USDC)
Month 2+:    grows linearly per payment (e.g. +200/month)
Cap:         maximum (e.g. 5,000 USDC)
After Claim: resets to base (anti-claim-farming)

```

This structurally prevents the #1 fraud vector (join → immediately claim → exit) without needing complex identity verification.

### Premium payments

Insureds pay recurring Premiums to maintain active coverage. The specific payment rail is TBD (deferred — see BEAN-5 in context/grilling-beans.md). The coverage-status logic is rail-agnostic: it needs a reliable "is this Insured current on payments?" signal, plus a payment count for tenure tracking. Coverage status is always computed on-the-fly from the payment record — no cached state:

- payment current + within grace period → covered
- missed payment beyond grace period → lapsed
- reinstatement after lapse → no-Claims window (anti-adverse-selection)

Recurring payments aren't just a bill — they maintain the Insured's coverage, and their payment count drives the tenure-based Coverage Tier.

### Evidence and privacy

Claim evidence (car photos, medical records, police reports) is **PII that cannot appear on a public chain.** Only the evidence commitment hash is posted on-chain. Cleartext evidence is encrypted and accessible only to drawn Jurors (via the Accord's evidence-access layer). No cleartext PII ever touches the public ledger.

### Governance

Progressive decentralization per Mutual:
- **v1:** Founder multisig with timelock controls all parameters
- **v2:** Staker governance (stake-weighted vote on financial parameters)
- **v3:** Futarchy (MetaDAO-style decision markets for settlement ratios, premium adjustments)

No governance token at any stage. v1 = multisig, v2 = stake-weight, v3 = futarchy.

Jurors never govern. The Juror roster is governed by the Accord program; the Mutual designates a Subaccord. No conflict of interest between rule-makers and rule-appliers.

### Legal posture

Each Mutual operates as a **discretionary mutual** — "cover, not insurance." Members contribute Premiums to a pool; the pool *may* pay Claims at its discretion (the Accord can deny). No binding indemnity contract → no insurance license required (arguably). This is the proven crypto template (Nexus Mutual since 2019). Founders who want regulatory credibility for a specific Mutual can pursue a licensed captive/SPV structure for that Mutual individually.

### What this is NOT

- Not licensed insurance (it is a discretionary mutual)
- Not a single shared pool (each Mutual is sovereign with isolated capital)
- Not crypto-asset cover only (the vision is arbitrary real-world risk: cars, dental, legal)
- Not a protocol token play (no governance token; the Mutual governs itself through its capital structure)
- Not built without the Accord (the Accord is the adjudication layer — the Mutual cannot function without it)
