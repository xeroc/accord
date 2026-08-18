# Synod — an N-party dispute-escrow Arbitrable over Accord

Accord Synod ("Synod") is a **separate Solana program** that runs N-party
disputes with escrowed stakes, with the verdict adjudicated by Accord via CPI.
It is **not** an Accord-Core extension — it is an *Arbitrable* (a client of
Accord's arbitration). **Accord Core stays party-agnostic (ADR-0004 preserved);
the only Core change Synod requires is the tally tie fix (see Dependencies).**

A Synod **Case** names 2–7 **Parties** up front (the roster). Each party joins
by staking the same amount `S` and committing their own evidence hash. When —
and only when — the full roster has joined, Synod files ONE single-filer Accord
dispute whose options are party-indexed (`option i ≡ "party i is right"`, last
slot = the neutral "no party prevails"), with the case PDA as the filer signer.
On the final Ruling, Synod pays the pot to the prevailing party (neutral →
refunds). A missed roster deadline means the case dies and a crank refunds
everyone — no fee was ever paid.

## Considered Options

**What Synod is.**

+ **An Accord-Core extension (two-party filing in Accord).** Rejected —
  requires a party concept in Accord (`Dispute` grows, ADR-0004 amended,
  option-order convention smuggled into the tally), and every future N-party
  shape would re-open Core. This was the original direction of parked bean
  `accord-s72c`; the grilling session of 2026-08-18 killed it.
+ **A separate Arbitrable program over Accord (chosen).** Clean separation:
  Accord adjudicates the question; Synod owns parties, roster, escrow, and
  payout. N-party is Synod's problem, never Accord's. Mirrors Canon's
  architecture (registry economics off-Core) and generalizes it.

**Party semantics.**

+ Open staking on any option (parimutuel). Rejected — that is the
  outcome-market shape (`PROG-OUTCOME-BETTING`); stakes there are bets, not
  skin-in-the-game.
+ **Identity-bound options (chosen):** `option i ≡ party i`, exactly one stake
  slot per party. Stake means commitment to one's own claim.

**Roster admission.**

+ Open roster (anyone joins as a new party). Rejected — stranger-defense: a
  random wallet can occupy "the side opposing Alice," win, and pocket forfeits
  while the real counterparty is bound by optics. That is the bounty/arena
  shape, not arbitration.
+ **Named roster (chosen):** the opener names every party pubkey at
  `open_case`; join is gated `signer == named[i]`. Roster 2..=7, distinct,
  opener first (index 0 = naming order — deterministic program state, parties
  never construct options).

**Roster misses / absent parties.**

+ Default judgment against an absent party. Rejected — with join optional in
  effect, default-against-absentee is a griefing machine against arbitrary
  wallets.
+ **File only on a full roster (chosen):** incomplete roster at the deadline →
  permissionless crank refunds every joined party `S` in full. Silence is a
  safe strategy for the named. No ex parte mode (a real unilateral-claim need
  is a single-option dispute filed directly at Accord).

**Neutral outcomes.**

+ None (jurors must crown a party). Rejected — the least-bad party would take
  forfeits for being least bad.
+ Split / refuse-to-arbitrate as separate slots. Rejected — "split" is the
  fuzziest Schelling target and a third payout mode; jurisdiction is not a
  juror question on Accord.
+ **One neutral slot, highest index (chosen):** "no party prevails" → refunds.
  Majority-neutral still resolves normally; a *tie* never resolves at all (see
  Dependencies).

**Appeals.**

+ Party-custodied appeal funding (Kleros default-judgment-on-solo-funder).
  Rejected for v1 — converts permissionless appeal (ADR-0004) into a party
  matching game Synod must referee.
+ **Passive appeals (chosen):** anyone appeals directly at Accord and posts
  their own bond; Synod never funds, matches, or tracks appeals. `claim` keys
  off the final Ruling whenever it lands.

## Consequences

+ **Accord Core unchanged except one dependency:** the Plurality tally must
  treat a top-count tie as a non-decisive round (`RedrawEligible` via the
  ADR-0021 seam; `Failed` on exhaustion) instead of `.max_by_key`'s arbitrary
  highest-index pick. With 3+ options a full-reveal odd-panel tie is
  structurally possible (5-panel: 2-2-1), so this is an Accord correctness fix
  that benefits every multi-option Arbitrable (Canon included). Tracked as
  bean `accord-n3vw`; its Accord ADR lands with the code change.
+ **Account model:** `SynodCase ["case", opener, nonce]` (parties, stake,
  frozen fee, join deadline, per-party evidence hashes, dispute binding,
  per-party payout bits); case-PDA-owned vault ATA in the Subaccord's
  `fee_token`. The case PDA is the Accord `filer` signer; Accord dispute PDA =
  `["dispute", case_pda, 0]` — one dispute per case.
+ **Evidence:** each party commits their own hash at join; the Accord-facing
  `evidence_hash[0] = H(case_pda ‖ h_0 ‖ … ‖ h_{N-1})` — the PDA identifies,
  the per-party hashes commit (a daemon bundle-swap is detectable). The
  evidence daemon groups per-party bundles by the case PDA before the dispute
  exists (bean `accord-ybuq`).
+ **Party==juror overlap is an accepted, documented risk.** Draw-time exclusion
  is structurally impossible against the stake-weighted MST; one captured seat
  is cheap to outvote and appeals are open.
+ **Out of scope (v1):** asymmetric stake multipliers, challenger bounties,
  backers sponsoring a party's side — parked in `accord-s72c` until a concrete
  product pulls them.

## Authority

`programs/synod/SPEC.md` (implementation reference) ·
`meta/specs/PROG-MULTI-PARTY.md` (design seed — grilling session 2026-08-18,
decision ledger) · Accord ADR-0004 / 0018 / 0021 / 0025 · `CONTEXT.md`.
