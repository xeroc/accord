# ADR-0033: Failed-path participation removed — no ruling, no pay

## Status

Accepted — implemented (amends ADR-0029 decision 3, the Failed-dispute path)

## Context

ADR-0029 made every fee on the success path coherence-aligned: a round's fee
pot settles at `settle_round` / `finalize_dispute` against `dispute.final_ruling`,
and no fee is paid on a vote that ends up incoherent. Its decision 3 carved out
one exception: the **Failed** path (cancel / redraw exhaustion — no final ruling
exists) still pays each *resolved* round's revealers a base `fee_per_juror`
participation fee, decrementing `dispute.fee_paid` (round 0) and consuming the
bonds' fee portions (appeal rounds) **before** the filer refund. The recorded
rationale: "Would let a redraw-exhausted dispute consume juror labor for free.
Rejected — the Failed path pays participation."

Two facts overturn that carve-out:

1. **It is philosophically inconsistent with ADR-0029's own thesis.** The ADR's
   robust core is that *no fee token rewards a vote regardless of its outcome*.
   Failed-path participation is exactly such a token: it rewards reveal labor
   with no outcome at all to be aligned with. "No coherent jurors possible"
   defines the success-path *fallback* (a ruling exists, nobody matched it);
   it does not define an entitlement when adjudication never concludes.

2. **The decrement breaks the refund contract every downstream Arbitrable
   naturally assumes.** The filer refund stops being the filing-time fee: a
   round-0-resolved-then-failed dispute refunds `(J−R)·fpj + bounty`, varying
   with reveal count. The first consumer integration (Riprap `hanse`, security
   review 2026-09-24 finding H-2) booked the filing-time fee `J·fpj` per claim
   and refunded it from a shared float — the shortfall reverts the settlement
   crank, freezing the entire mutual (`claims_filed != claims_resolved` →
   settlement/dissolution unreachable, all member funds locked). This is not a
   hanse implementation quirk; "refund what was booked at filing" is the only
   accounting an Arbitrable can do without replicating accord's internal
   round/reveal bookkeeping — which would be strictly worse rev-coupling.

## Decision

**No ruling, no pay.** All Failed paths pay zero participation:

- `cancel_dispute` (both branches) and `redraw`'s exhaustion branch release
  every drawn juror's `active_draws` + `slash_reserve` and nothing else;
  `release_prior_rounds` loses its fee parameters entirely.
- `dispute.fee_paid` is **never decremented before settlement**: the filer
  refund is exactly the filing-time fee (`+` the filer's own ADR-0030 bounty
  unit where applicable) on every Failed path.
- `claim_appeal_refund` returns the **whole** `AppealBond.amount + reward` on
  `Failed`: the appeal fee's only destination — the round's jurors — earns
  nothing, so the unconsumed deposit returns to its depositor (the same
  principle as the filer refund; a trapped ownerless fee is worse accounting
  than a returned one). The `Final` path is unchanged (bond only, never the
  fee — bean accord-xftx).
- Slashing is untouched: no-show slashes still realize on the exhaustion path;
  `alpha_bps · min_stake` remains stake-mint and never interacts with the fee
  ledger.

Arbitrables may now treat the Failed refund as **exactly the booked filing
fee** — no float shortfall, no commingling across claims, no dependence on
reveal counts.

## Considered Options

- **Keep participation (ADR-0029 D3 as shipped).** Breaks the
  filing-fee-equals-refund invariant for every Arbitrable (Riprap H-2 class);
  rejected.
- **Pay participation out of forfeited appeal bonds** (attribute the round's
  wages to the party nearest the failure). Keeps a fee-regardless-of-outcome
  token, complicates bond accounting, and misattributes systemic draw
  exhaustion to appellants. Rejected.
- **Kleros-strict on the success path too** (kill the no-coherent revealers
  fallback). Rejected — there a final ruling *exists*; the fallback prevents
  trapping ownerless fees when adjudication concludes coherently-empty. The
  0033 line is: ruling exists → participation fallback stands; no ruling →
  nothing.

## Consequences

- Juror labor on eventually-failed disputes is uncompensated. Accepted
  deliberately, symmetric with Kleros §4.6 ("some times, honest jurors will
  lose coins"): the compensation for failed-dispute risk remains the
  vindicated-dissenter payoff and per-round evidence scoping (ADR-0023) on the
  success path.
- Forcing a failure post-appeal becomes cheaper (full fee refund, whole bond
  return — marginal cost ≈ rent + no-show slash risk). Bounded by appeal
  requirements (bond capital, slash on no-show) and, for Arbitrables, their
  own filing gates; operators should not rely on Failed-path fees as an
  anti-spam budget.
- The vault invariant loses all Failed-path `fees_earned` terms; the filer
  refund becomes provably exact per dispute.
- IDL unchanged (`release_prior_rounds` is internal; account layouts and
  instruction surfaces are untouched — only `remaining_accounts` semantics
  simplify). e2e fee assertions for cancel/redraw move.
- Riprap impact: `hanse`'s H-2 resolves at the source once its accord pin is
  bumped past this ADR (tracked as a high-priority bean in that repo; the
  pin-bump checklist must re-verify `filing_fee()` shape, the `Closed`
  terminality set, and now this refund-exactness contract).

## References

- ADR-0029 (decision 3 as amended here; its Considered Options entry
  "Kleros-strict with no participation floor on the Failed path" is
  effectively revisited and now accepted in this narrower form).
- ADR-0030 (flip-bounty — the filer's own unit still refunds on Failed;
  appellants' units still strip onto bonds).
- Riprap security review 2026-09-24, finding H-2 (the consumer-side failure
  mode that motivated this ADR).
