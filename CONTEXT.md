# Accord — Domain Language

The ubiquitous language for the Accord context. Terms are opinionated: when multiple words exist for the same concept, one is canonical and the others are listed under _Avoid_.

---

## Accord Context

**Accord**:
The arbitration program — a general-purpose Schelling-point dispute resolution system on Solana. Any program can file Disputes; the Accord draws Jurors, collects votes, and emits Rulings.
_Avoid_: Kleros-clone, arbitration engine, judge program

**Subaccord**:
A specialized Juror pool within the Accord. Each Subaccord defines its staking token, minimum stake, review window, and dispute parameters. Jurors self-select into Subaccords matching their expertise. Permissionless — anyone can create one.
_Avoid_: accord branch, tribunal, panel

**Juror**:
A participant who stakes capital into a Subaccord and is eligible to be drawn to vote on Disputes. Selected randomly, weighted by stake. Compensated for Coherent votes; slashed for Incoherent votes.
_Avoid_: judge, arbitrator, voter

**Dispute**:
A case filed with the Accord by any program (the Arbitrable). Contains the disputed question, evidence commitment hash, and vote options. Progresses through Draw → Commit → Reveal → Ruling, with optional Appeals.
_Avoid_: case, claim (in the Accord context), trial

**Draw**:
The random selection of distinct Jurors for a Dispute from a Snapshot, weighted by staked capital. Uses VRF for manipulation resistance.
_Avoid_: jury selection, sortition

**Snapshot**:
A committed view of a Subaccord's Juror set and stake weights, frozen at Dispute creation so the Draw is provably fair and manipulation-resistant.
_Avoid_: juror registry, roster

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
Voting with the Ruling majority. Coherent Jurors earn arbitration fees + slashed stake from Incoherent Jurors.
_Avoid_: correct vote, winning vote

**Incoherence**:
Voting against the Ruling majority. Incoherent Jurors lose a fraction of their stake (the slash) to Coherent Jurors. This is the incentive that makes the Schelling Point work.
_Avoid_: wrong vote, losing vote

**Appeal**:
Escalation of a Dispute to a larger Juror panel (2N+1). Permissionless — anyone may Appeal by posting an Appeal Bond. Exponentially rising cost makes bribery prohibitively expensive; the bond is forfeited to Coherent Jurors if the new panel does not overturn the prior Ruling.
_Avoid_: retrial, reconsideration

**Arbitrable**:
Any Solana program that files Disputes with the Accord. The interface: `create_dispute(subaccord, options, evidence_hash, fee) → dispute_id` and `get_ruling(dispute_id) → winning_option`.
_Avoid_: client, consumer (of the accord)

**Evidence Operator**:
A Subaccord-designated off-chain service that re-encrypts the filer's evidence for the drawn Jurors of that Subaccord.
_Avoid_: evidence relay, decryption service, coordinator

---

## Platform

**Cranker**:
Any permissionless actor who triggers time-based operations: Dispute round advancement, ruling finalization. Incentivized by small fees or social good.
_Avoid_: bot, keeper, operator

**Schelling Point**:
The game-theoretic concept underpinning the Accord: independent agents converge on the most salient answer without communication. In Accord, the Schelling Point is honesty — Jurors vote truthfully because they expect others to, because they expect others to expect it. Named after Thomas Schelling.
_Avoid_: focal point (use in prose, not as a defined term), Nash equilibrium
