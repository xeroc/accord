# Accord — Domain Language

The ubiquitous language for the Accord context. Terms are opinionated: when multiple words exist for the same concept, one is canonical and the others are listed under _Avoid_.

---

## Accord Context

**Accord**:
The arbitration program — a general-purpose Schelling-point dispute resolution system on Solana. Any program can file Disputes; the Accord draws Jurors, collects votes, and emits Rulings.
_Avoid_: Kleros-clone, arbitration engine, judge program

**Subaccord**:
A specialized Juror pool within the Accord. Each Subaccord defines its staking token (collateral), fee token (compensation), minimum stake, review window, and dispute parameters. Jurors self-select into Subaccords matching their expertise. Permissionless — anyone can create one.
_Avoid_: accord branch, tribunal, panel

**Juror**:
A participant who stakes capital into a Subaccord and is eligible to be drawn to vote on Disputes. Selected randomly, weighted by stake. Compensated for Coherent votes; slashed for Incoherent votes.
_Avoid_: judge, arbitrator, voter

**Dispute**:
A case filed with the Accord by any program (the Arbitrable). Contains the disputed question, a per-round evidence commitment (`evidence_hashes[0..=MAX_APPEALS]`, one ADR-0017 manifest hash per round; `[0u8;32]` = reuse prior round's), and vote options. Progresses through Draw → Commit → Reveal → Ruling, with optional Appeals.
_Avoid_: case, claim (in the Accord context), trial

**Draw**:
The random selection of distinct Jurors for a Dispute from the Subaccord's stake Accumulator, weighted by staked capital. Per-seat (`draw_seat`); seeded by a committed VRF. The Accumulator root is frozen at VRF-commit so the Draw is provably fair and manipulation-resistant.
_Avoid_: jury selection, sortition

**Accumulator**:
A live on-chain Merkle-Sum Tree over a Subaccord's Juror set and stake weights, maintained incrementally on every `stake`/`unstake`. Only the root (`root_hash`, `total_stake`, `next_index`, `depth`) lives on-chain; the full tree is held off-chain by indexers. The root is canonical by construction — there is no posted root to withhold or fabricate, hence no bond, no challenge window, and no fraud predicates (ADR-0012).
_Avoid_: snapshot, juror registry, roster

**Commit**:
A Juror's secret submission of `hash(vote, salt)`. Prevents vote-copying so the Schelling Point forms independently.
_Avoid_: sealed bid, secret ballot

**Reveal**:
A Juror's disclosure of `{vote, salt}` after all Commits are in. The Accord verifies the hash matches the Commit.
_Avoid_: unseal, open

**Ruling**:
The Accord's verdict on a Dispute — the option that received the majority of Juror votes. Written on-chain; readable by the Arbitrable program.
_Avoid_: verdict, judgment, decision

**Coherence**:
Voting with the Ruling majority. Coherent Jurors earn arbitration fees (in `fee_token`, via `fees_earned`) + slashed stake (in `staking_token`, via `stake_delta`) from Incoherent Jurors.
_Avoid_: correct vote, winning vote

**Incoherence**:
Voting against the Ruling majority. Incoherent Jurors lose a fraction of their stake (the slash, in `staking_token`) to Coherent Jurors. This is the incentive that makes the Schelling Point work.
_Avoid_: wrong vote, losing vote

**Appeal**:
Escalation of a Dispute to a larger Juror panel (2N+1). Permissionless — anyone may Appeal by posting an Appeal Bond (in `fee_token`). An appeal may introduce new evidence: the appellant passes a `new_evidence_hash` written to the new round's slot of `evidence_hashes` (`[0u8;32]` = appeal on the existing evidence; ADR-0023). Exponentially rising cost makes bribery prohibitively expensive; the bond is forfeited to Coherent Jurors if the new panel does not overturn the prior Ruling. The **appeal window** (the gap between a round resolving and the dispute going final) is per-Subaccord (`terms.appeal_window`, frozen at filing, ADR-0022; default 3 days), not program-global.
_Avoid_: retrial, reconsideration

**Arbitrable**:
Any Solana program that files Disputes with the Accord. The interface: `create_dispute(subaccord, options, evidence_hash, fee) → dispute_id` and `get_ruling(dispute_id) → winning_option`.
_Avoid_: client, consumer (of the accord)

**Evidence Operator**:
A Subaccord-designated off-chain service that re-encrypts the filer's evidence for the drawn Jurors of that Subaccord.
_Avoid_: evidence relay, decryption service, coordinator

**Credential Authority**:
A trusted off-chain service that issues Solana Attestation Service (SAS) attestations binding a Juror's wallet to a credential under a schema. A peer of the Evidence Operator: where the Evidence Operator controls evidence delivery, the Credential Authority controls who may sit on a gated Subaccord's panel. A Subaccord opts into the gate by setting `juror_credential`/`juror_schema` at creation; thereafter every Juror must hold a valid, unexpired attestation from this authority to stake and be drawn. Like the Evidence Operator, the trust is explicit and off-chain — the Accord verifies the attestation's on-chain binding, not the authority's judgment.
_Avoid_: attestation issuer, KYC provider (unless it literally is one), identity oracle

**SAS (Solana Attestation Service)**:
The on-chain attestation framework — a Pinocchio program — that records credential-to-wallet bindings as `Attestation` accounts. The Accord reads these as read-only proof and never trusts the issuer beyond the binding a Subaccord opts into: it checks the account's owner, discriminator, credential, schema, subject wallet, and expiry.
_Avoid_: attestation service, attestation program, identity program

**Attestation gate (`juror_credential` / `juror_schema`)**:
An optional, immutable Subaccord credential binding. When both fields are `Pubkey::default()` the Subaccord is stake-only (today's behavior, unchanged); when set together — both-or-neither, a half-bound pool is rejected at `create_subaccord` — a Juror must present a matching SAS attestation to `stake` and at every `draw_seat`. `expiry == 0` means the credential never expires; otherwise it must outlive the maximum dispute lifecycle horizon at stake time.
_Avoid_: KYC gate, credential filter, identity gate

**prune_juror**:
A permissionless crank that evicts a Juror whose attestation has a real expiry (`!= 0`) that has passed (`≤ now`) from a gated Subaccord's accumulator. It mirrors `request_withdraw` for the full staked amount — zeros the leaf's selection weight, recomputes the root, banks the tokens into `pending_withdrawal` — so the evicted Juror completes the two-phase `withdraw` (or re-stakes with a renewed attestation). Without it, an expired Juror left in the tree is a dead zone that stalls the draw.
_Avoid_: eviction, force-unstake, kick

---

## Platform

**Cranker**:
Any permissionless actor who triggers time-based operations: Dispute round advancement, ruling finalization. Incentivized by small fees or social good.
_Avoid_: bot, keeper, operator

**Schelling Point**:
The game-theoretic concept underpinning the Accord: independent agents converge on the most salient answer without communication. In Accord, the Schelling Point is honesty — Jurors vote truthfully because they expect others to, because they expect others to expect it. Named after Thomas Schelling.
_Avoid_: focal point (use in prose, not as a defined term), Nash equilibrium
