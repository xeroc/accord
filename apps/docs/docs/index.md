# Accord

General-purpose, **capital-weighted Schelling arbitration oracle** on Solana.

Any Solana program can file a **dispute** via a single CPI call. The Accord
draws **stake-weighted jurors** using a verifiable random function, collects
**commit-reveal votes**, and emits a **ruling** the filer reads lazily. No
central judge is picked — the Schelling equilibrium makes honesty the profitable
strategy **conditional on an honest stake majority**. See the
[Trust Profile](security/trust-profile.md) for every residual assumption.

## Why use it

- **Two CPI calls to integrate**: `create_dispute()` → `get_ruling()`. The
  Accord has zero knowledge of your program's domain.
- **Schelling-point security (honest-majority-stake assumed)**: jurors vote
  truthfully because voting with the majority is the profitable strategy.
  Inspired by Kleros (Ethereum, since 2019, 1000+ disputes).
- **Oracle-verified randomness**: the magicblock VRF (RFC 9381) determines juror
  selection. Unbiasable, unpredictable, on-chain verifiable. Availability is
  provider-dependent — see the [Trust Profile](security/trust-profile.md).
- **Canonical juror-set root**: a live on-chain stake accumulator (Merkle-Sum
  Tree) keeps the juror set + stake weights as a root maintained on every
  `stake`/`unstake`. No posted root to withhold, no bond, no fraud window — the
  draw is manipulation-resistant by mechanism (ADR-0012).
- **Exponential appeals**: 3 → 7 → 15 → 31 jurors. Bribery is deterred, not
  structurally impossible — see the security-value ceiling in the
  [Trust Profile](security/trust-profile.md).

## How it works

```
Your Program (Arbitrable)
    │
    ├─ create_dispute(subaccord, options, evidence_hash, fee)
    │      └─ Accord draws N jurors (VRF, stake-weighted)
    │      └─ Jurors commit hash(vote, salt) → reveal {vote, salt}
    │      └─ Majority → Ruling
    │
    └─ get_ruling(dispute_id) → winning_option
```

## What you need

1. **A Subaccord** — a specialized juror pool with its own staking token, min
   stake, and fee schedule. Use an existing one or create your own
   (permissionless).
2. **Capital** — the filer pays `jurors_per_dispute × fee_per_juror` per round.
   Appeals cost exponentially more.
3. **The SDK** — `@accord/sdk` for TypeScript, or raw Anchor IDL for any
   language.

## Next steps

- [Quickstart](quickstart.md) — file your first dispute in 5 minutes
- [Integration Guide](integration/index.md) — step by step
- [Protocol Reference](reference/index.md) — accounts, instructions, errors
- [Security Model](security/index.md) — why the mechanism is trustworthy
- [Trust Profile](security/trust-profile.md) — what's trusted and the
  security-value ceiling
- [Architecture Decisions](adr/index.md) — the _why_ behind every design choice

## Deep reads

- [Project Rationale](../../../PROJECT.md) — why this exists
- [Domain Language](../../../CONTEXT.md) — glossary of terms
- [Build Spec](../../../programs/accord/SPEC.md) — account model, instructions,
  economics
