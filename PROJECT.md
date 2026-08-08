# Accord — Project Rationale

> This document is the **why** and the **what**. The _how_ — account model,
> instructions, state machine, economics — lives in `programs/accord/SPEC.md`
> and the ADRs under `apps/docs/adr/accord/`.

## Why

Subjective disputes are everywhere: "was this car accident covered?", "did the
freelancer deliver?", "is this NFT authentic?", "was this protocol exploit in
scope?". Smart contracts can't adjudicate these — they require judgment.

On Ethereum, Kleros solved this: a Schelling-point-based decentralized court
where random stake-weighted jurors vote honestly because coherence (voting with
the majority) is the profitable strategy. It has been live since 2019, 1000+
disputes settled, its curated-list product alone resolving ~500.

**Solana has no equivalent.** Dispute resolution on Solana is either centralized
(trusted multisig committees), absent, or an unaudited cross-chain port. There is
no native Schelling-point arbitration primitive that any Solana program can use.

The demand is not hypothetical — it is acute and growing on three fronts:

- **Subjective authenticity at memecoin scale.** Anyone can mint an SPL token
  with a copied name, symbol, and logo; the mint address is the only real
  identity. ~98.6% of tokens on launchpads collapse into pump-and-dumps, and
  central token lists are fragmenting. The question "is this the genuine
  project, or a same-name impersonator?" is a subjective judgment that automated
  checkers (lock status, holder concentration) cannot make — and that a randomly
  drawn, slashed jury was built for.
- **The upgrade-authority trap.** Every upgradable Solana program faces a binary
  choice: renounce the authority (can't patch bugs) or keep it (rug risk). The
  recent wave of nine-figure multisig drains came not from broken membership but
  from **compromised signers approving malicious payloads** — a problem no
  custody layer fixes. What teams want is the missing middle: keep the authority
  _and_ make every privileged action survive an independent verdict before it
  executes.
- **Everywhere a "who is right?" gate is missing.** DeFi insurance,
  freelancing escrows, DAO governance disputes, grant accountability,
  prediction-market resolution. Each needs adjudication that doesn't trust a
  single party.

## What

**Accord** is a general-purpose, Schelling-point-based arbitration oracle on
Solana. Any Solana program can file disputes; the Accord draws jurors, collects
commit-reveal votes, and emits rulings — governed by game-theoretic incentives
rather than a hired-judge committee.

> **Honest positioning.** Accord is an **arbitration oracle**, not a
> self-enforcing decentralized court. The Schelling honesty equilibrium holds
> _conditional on an honest stake majority_; randomness is externally supplied,
> evidence is delivered via a trusted operator, and enforcement is the
> integrator's responsibility. Several roles retain privileged or concentrated
> power. The [Trust Profile](apps/docs/docs/security/trust-profile.md) states
> each residual assumption and the security-value ceiling. "Decentralized court"
> / "trustless" overstate the trust distribution.

### Core mechanism

```
1. A program files a Dispute (via CPI): subaccord, options, evidence hash, fee
2. The Accord randomly draws N Jurors from the Subaccord (VRF, weighted by stake)
3. Drawn Jurors review encrypted evidence (accessible only to them)
4. Each Juror Commits hash(vote, salt) — secret, prevents vote-copying
5. After all Commits, Jurors Reveal {vote, salt}
6. Majority wins → Ruling
   - Coherent Jurors earn fees + slashed stake from Incoherent Jurors
   - Incoherent Jurors lose a fraction of their stake
7. Losing party can Appeal → 2N+1 Jurors (exponential cost → bribery-prohibitively-expensive)
```

### Key properties

- **Schelling Point = honesty (honest-majority-stake assumed).** Jurors converge
  on the truthful answer because voting coherently with the group is the
  profitable strategy. No central judge is picked — the honesty equilibrium
  holds conditional on an honest stake majority (see
  [Trust Profile](apps/docs/docs/security/trust-profile.md)).
- **Subaccords.** Specialized juror pools (automotive, dental, freelancing,
  NFTs). Jurors self-select by expertise. Permissionless creation — anyone can
  register a Subaccord.
- **Per-Subaccord economics (two mints).** Each Subaccord defines its
  `staking_token` (collateral — sortition weight + slash exposure) and its
  `fee_token` (compensation — fees + appeal bonds, USDC by convention). Stake is
  the anti-sybil mechanism and the coherence-slashing substrate; fees are what
  jurors earn. USDC is the common default, not hard-coded.
- **Arbitrable interface.** Any Solana program can use the Accord:
  `create_dispute()` → `get_ruling()`. Two CPI calls. The Accord has no knowledge
  of the filing program's domain.
- **Commit-reveal voting.** Prevents vote-copying, which is what makes the
  Schelling Point form independently. Without secret votes, Jurors would copy
  the majority instead of reasoning.
- **Exponential appeals.** Each appeal doubles the jury + 1 (3 → 7 → 15 → 31).
  Makes bribery exponentially expensive — the core anti-attack mechanism from
  Kleros.

### What gets built on top

Accord is a **shared verdict spine**, not an application. Applications are
separate programs (Arbitrables) that file disputes via CPI, read the ruling, and
own the consequences — deposit redistribution, execution, status flips. The
Accord never learns what a dispute is _about_. Four concrete shapes illustrate
the reach; each is an independent program consuming the same two-call interface.

| Arbitrable                          | The question it puts to a jury                         | What the program owns on top of the verdict                                      |
| ----------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Token & content registries**      | "Is this mint the genuine project, or an impersonator?" | Item lifecycle (admit / remove) and submitter-vs-challenger deposit economics   |
| **Verdict-gated escrow**            | "Were the milestones delivered — release or withhold?" | A release hook: escrow pays out only on a positive ruling (no custodial middleman) |
| **Adjudicated authority execution** | "Should this upgrade / treasury move execute?"         | The sole execution key: nothing lands without a positive verdict                 |
| **Credential-gated expert pools**   | (specialization, not a dispute)                        | A Subaccord that admits only holders of a verifiable on-chain qualification      |

**Token & content registries (curated lists).** The proven #1 demand in
decentralized arbitration. A registry holds items (tokens, NFT collections,
address tags) and their submitter/challenger deposits; when an item is
challenged, the registry is the single filer — `create_dispute(["list",
"remove"], …)` — and on the ruling it flips item status and redistributes
deposits winner ← loser. The wedge is the _subjective_ slice (provenance,
intent, real-vs-impersonator) that automated token checkers cannot resolve —
exactly the judgment Schelling jurors converge on.

**Verdict-gated escrow.** A tiny verdict oracle plugs into a token escrow's
release path: before the escrow moves a single token, it reads the linked
dispute's `final_ruling` and releases only on a positive verdict. Use cases are
skin-in-the-game bonds that only the depositor _wanted_ gated — performance /
milestone bonds, grant-accountability locks, slashing-conditional bonds. The
program owns no tokens and signs nothing; it is a fail-closed read gate.

**Adjudicated authority execution (the "Schelling Gate").** A program holds —
or is the sole executor of — a privileged on-chain authority (a program upgrade
authority, a mint/freeze/admin key, or the sole Execute-member of a multisig)
and exercises it _only_ after a positive final ruling. It delivers the missing
middle teams actually want: keep the authority (can patch bugs) but lose
unilateral execution (can't rug). Because the gate is structurally the only
thing that can execute, even a fully compromised signer set cannot drain funds —
defense-in-depth against the compromised-signer drain class.

**Credential-gated expert pools.** Stake proves capital, not competence — and
the Schelling point silently fails when jurors cannot _recognize_ the truthful
answer. By binding a Subaccord to an on-chain attestation (a verifiable
qualification: an audit firm, a professional board, a curatorial expert), only
credentialed jurors enter the pool. Stake stays the anti-sybil / slashing
substrate; the attestation becomes the anti-incompetence gate — making
specialized Subaccords (smart-contract audit, dental negligence, art
authentication) enforce the expertise they are named for.

These four are illustrative, not exhaustive — and not all exist today. The point
is structural: any program that needs a "who is right?" decision can become an
Arbitrable with two CPI calls, without the Accord changing.

### Why this is a standalone product

The Accord doesn't depend on any of the applications above. It's a general-
purpose primitive — a Solana-native Schelling arbitration oracle (inspired by
Kleros, not a port of it). It ships first and proves the Schelling mechanism on
Solana; client programs plug in on top via the Arbitrable CPI.

| Use case           | Dispute example                            |
| ------------------ | ------------------------------------------ |
| Freelancing escrow | "Did the developer deliver as specified?"  |
| NFT authenticity   | "Is this token an authentic original?"     |
| Curated lists      | "Does this token belong on the whitelist?" |
| DAO governance     | "Was this proposal executed correctly?"    |
| Prediction markets | "Did the event resolve YES or NO?"         |

### What this is NOT

- Not an oracle (it doesn't provide data feeds — it adjudicates subjective questions)
- Not a governance system (it resolves disputes, it doesn't set policy)
- Not Kleros (it's a new Solana-native implementation with VRF, per-Subaccord tokens, and the Arbitrable CPI interface)
