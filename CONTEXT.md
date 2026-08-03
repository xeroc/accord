# VeriDAO — Domain Language

The ubiquitous language for both the Accord and Mutual contexts. Terms are opinionated: when multiple words exist for the same concept, one is canonical and the others are listed under _Avoid_.

> **Why "Mutual", not "Insurance":** what we build is a **discretionary mutual** — members pool risk collectively; the pool _may_ pay claims at its discretion (the Accord can deny). There is no binding indemnity contract, no insurance license, no guaranteed payout. Calling it "insurance" would be legally inaccurate (it isn't licensed insurance), regulatorially risky (the word "insurance" is heavily regulated in most jurisdictions), and structurally dishonest (payouts are discretionary, not contractual). "Mutual" accurately describes the risk-pooling structure, avoids the regulated word, and matches the proven crypto template (Nexus Mutual since 2019). We use "insurance" only when referring to the existing licensed-insurance sector as a market reference — never to describe our own product.

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
The random selection of distinct Jurors for a Dispute from a Snapshot, weighted by staked capital. Uses Switchboard VRF for manipulation resistance.
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
_Avoid_: verdict, judgment, decision (in the Accord context — "Settlement" is reserved for the Mutual context)

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

## Mutual Context

**Mutual**:
A single-purpose, sovereign risk-pooling entity created by the factory. Each Mutual covers exactly one risk type (car accidents, dental, drug-raid legal defense). Has its own Premium Fund, Reserve Fund, policies, and Subaccord designation. Structured as a discretionary mutual — payouts are at the pool's discretion (the Accord can deny), not a binding indemnity contract. This is NOT licensed insurance.
_Avoid_: insurance DAO, insurance protocol, coverage pool, insurance product

**Insured**:
A person who pays Premiums (recurring payments), holds a Policy, and can file Claims. In a mutual, the Insured are also the collective capital providers — their Premiums fund the pool.
_Avoid_: customer, client, policyholder, member

**Policy**:
An on-chain account (PDA) recording an Insured's coverage terms: risk type, activation timestamp, payment-count baseline, and last-claim-reset point. Non-transferable. Reads the premium payment system live — no cached coverage state. (Payment rail TBD — see BEAN-5.)
_Avoid_: contract, coverage agreement, insurance policy

**Premium**:
The recurring payment an Insured pays to maintain active coverage. Consumed — it does not build redeemable capital. Flows into the Premium Fund. (Payment rail TBD — see BEAN-5.)
_Avoid_: subscription, fee, contribution

**Premium Fund**:
The current-period pool of collected Premiums. First-loss — Claims draw from it before touching the Reserve Fund. Resets each Settlement period.
_Avoid_: premium pool, operating fund

**Reserve Fund**:
The backstop, holding Staker capital and retained surplus from prior periods. Second-loss — only drawn when the Premium Fund is exhausted. Drawing from it triggers pro-rata slashing of all Staker Positions.
_Avoid_: insurance fund, capital pool, treasury

**Staker**:
A capital provider who deposits at-risk funds into the Reserve Fund. Cannot file Claims. Earns a yield from period Surplus. Bears tail risk: their capital is slashed when Claims exceed the Premium Fund. Exits at Settlement only, after lockup.
_Avoid_: underwriter, LP, liquidity provider, investor

**Staker Position**:
An on-chain account (PDA) recording a Staker's deposit, entry timestamp, accumulated yield, slash deductions, and current balance. Non-transferable in v1.
_Avoid_: stake, deposit, bond

**Claim**:
A request for payout filed by an Insured. Specifies event details and claimed amount. Routed to the Accord as a Dispute. If the Accord Rules in favor, the Claim is paid from the Premium Fund (then Reserve Fund if exhausted). Filing a Claim resets the Insured's Coverage Tier to base.
_Avoid_: payout request, insurance claim, incident report

**Coverage Tier**:
The maximum amount an Insured can claim at their current tenure level. Computed from the bounded tenure formula: waiting period → base → linear growth → cap. Resets to base after a paid Claim.
_Avoid_: coverage amount, coverage limit, sum insured

**Coverage Cap**:
The maximum Coverage Tier reachable by any Insured in a given Mutual. Set by the Founder. Constrains the Mutual's total exposure.
_Avoid_: max payout, policy limit

**Waiting Period**:
The initial period during which a new Policy has zero coverage (no Claims accepted). Anti-fraud: prevents join-and-immediately-claim. Measured in payment count, not time.
_Avoid_: vesting period, exclusion period

**Settlement**:
The period-close accounting event. Computes Surplus, distributes it (retained reserve + Staker yield + Insured refund), processes Staker withdrawals, reconciles active coverage, and resets the Premium Fund. Triggered permissionlessly by a Cranker after `period_length` elapses.
_Avoid_: rebalance, epoch end, distribution

**Surplus**:
Premiums collected minus Claims paid in a Settlement period. If positive, distributed per governance-set ratios. If negative, no distribution (Stakers already absorbed the loss via slashing).
_Avoid_: profit, excess, overflow

**MCR (Minimum Capital Requirement)**:
The solvency gate on Policy issuance. New policies are blocked when the Reserve Fund falls below `total_active_coverage × mcr_factor`. Over-counted between Settlements (conservative).
_Avoid_: solvency ratio, capital requirement, reserve ratio

**Grace Period**:
The tolerance window after a missed Premium payment during which coverage remains active. If payment resumes within the window, continuous coverage. If not, the Policy lapses.
_Avoid_: payment window, cure period

**Reinstatement Window**:
A no-Claims period after a Policy is reinstated following a lapse. Prevents adverse-selection gaming (lapse → hear about an incident → rush to reinstate → Claim).
_Avoid_: reactivation period, probation

---

## Shared / Platform

**Founder**:
The entity that creates a Mutual via the factory. Sets initial configuration (risk type, premium, coverage terms, Subaccord designation). Controls mutable parameters via a multisig (v1), transitioning to Staker governance (v2) and futarchy (v3).
_Avoid_: creator, deployer, admin

**Cranker**:
Any permissionless actor who triggers time-based operations: Settlement, Claim finalization, Dispute ruling execution. Incentivized by small fees or social good.
_Avoid_: bot, keeper, operator

**Schelling Point**:
The game-theoretic concept underpinning the Accord: independent agents converge on the most salient answer without communication. In VeriDAO, the Schelling Point is honesty — Jurors vote truthfully because they expect others to, because they expect others to expect it. Named after Thomas Schelling.
_Avoid_: focal point (use in prose, not as a defined term), Nash equilibrium
