# ADR-0030: Flip-bounty — finality-settled reward for verdict-flipping appellants

## Status

Accepted (implementation pending — bean `accord-82yf`; blocked by `accord-3j58`)

## Context

The appeal-economics audit (2026-08-31) and the ADR-0029 decision leave one
incentive gap open. An appellant who correctly flips a wrong ruling recovers
only the bond — net cost `N_new · fee_per_juror` even when right. There is no
on-chain reward for correction:

- A no-flip bond forfeits to the final round's **coherent jurors** (ADR-0004)
  — nothing ever flows to a successful appellant.
- The best case for a third-party corrector (watchtower) is **−1× fee**.
- Owner directive (2026-08-31 grilling): Accord must be **inherently
  consistent** — it cannot rely on the Arbitrable layer (cost-shifting via
  Canon/Synod deposits) to fund appeal incentives, and Kleros-style
  two-sided crowdfunding is a larger future mechanism, not today's fix.

The concrete failure mode is the **lone successful appeal**: one appeal, it
flips, no later frivolous appeals exist — so no forfeit pot exists for any
2b-style routing to draw from. The wrong-but-uncontested ruling problem
(judgment-poor or diffuse-interest beneficiaries never appeal) has no
on-chain counterweight.

ADR-0029 changes the terrain: with fees settling at finality, the fee pool
is **intact and routable at finalization** — a reward can be funded and
disposed of in the same settlement pass that judges everyone else.

## Decision

### 1. The flip-bounty pool: `+1 · fee_per_juror` at creation and at every appeal

- `create_dispute`: the filer tenders `(min_jury_size + 1) · fee_per_juror`.
  The extra unit banks into a new `Dispute.bounty_pool: u64` (ledger; tokens
  custodyed in the shared `fee_vault`).
- `appeal`: the appellant tenders `(N_new + 1) · fee_per_juror` fee +
  `N_new · fee_per_juror` bond. The extra unit joins `bounty_pool`.
  `AppealBond.amount` semantics are **unchanged** (`fee + bond`), so
  `claim_appeal_refund`'s `amount − panel·fee_per_juror` math is untouched.
- Pool size at finality is deterministic: `(1 + appeal_count) · fee_per_juror`
  — no per-contributor tracking is needed for the Final outcomes.

### 2. Disposition at finalization

| Terminal outcome | Bounty pool |
|---|---|
| **Final, no appeal ever** | refundable to the **filer** (lazy claim) |
| **Final, ≥1 flip** | split equally among **aligned flippers** (rule below), paid as a top-up on their `claim_appeal_refund` |
| **Final, appeals but no flip** | rolled into the final round's `pool_extra` — joins the forfeited bonds in the **final round's coherent-juror pool** |
| **Failed** (redraw exhaustion / cancel) | per-source refund: filer's +1 rides the existing filer refund (`fee_paid` + `bounty_pool`); each appellant's +1 rides their `claim_appeal_refund` |

Nothing is paid before the dispute is terminal — same discipline as
ADR-0029.

### 3. Aligned flipper (the multi-flip rule)

An appeal is an **aligned flipper** iff:

```text
bond.prior_result ≠ dispute.final_ruling          (it attacked a result the
                                                   final ruling rejected)
∧ round[bond.round_idx].result == final_ruling    (its own round's verdict
                                                   IS the final ruling)
```

This is the owner rule ("flipped the previous round's verdict AND flipped it
to the final verdict") and it is precisely **ADR-0018's coherence test
applied to appeals**: an appellant "votes" by appealing; appeals coherent
with the final ruling get paid, incoherent ones forfeit their +1 into the
pool. One Schelling anchor (`what the final, largest panel concludes`) now
governs jurors AND appellants.

- The A→B→A whipsaw pays the second flipper and stiffers the first — correct,
  and identical to how a round-0 juror who voted B is treated when the final
  ruling is A.
- **Non-empty by construction:** the final ruling *is* the last round's
  result, and that round exists because some appeal created it; that
  appellant's post-round result equals the final ruling. Whenever a flip
  exists, at least one eligible beneficiary exists (defensive fallback if
  ever violated: route the pool to `pool_extra` like the no-flip case).
- Shares are computed and written onto each aligned `AppealBond`
  (`reward: u64`) at `finalize_dispute`; claims stay lazy and idempotent
  (zero-on-claim, same pattern as the bond refund).

### 4. Coupling

- **Filing cost rises by `fee_per_juror`** (~+33% at `min_jury_size` = 3),
  refundable whenever the dispute is never appealed. Accepted.
- **Arbitrables must tender the +1**: Canon's challenge flow and Synod's
  `frozenFee` (`minJurySize · feePerJuror`) each grow by one unit — a real,
  required downstream change (unlike ADR-0029, which left them untouched).
- **Vault-ledger invariant** gains the pool:
  `fee_vault.balance == Σ fee_paid + Σ fees_earned + Σ AppealBond.amount + Σ bounty_pool`.
- The `FeeMismatch` check becomes `(min_jury_size + 1) · fee_per_juror`.

## Considered Options

- **Appellant-only funding (+1 at appeal, none at creation).** Rejected — the
  lone flipper only reclaims their own token (a wash); the gap this ADR
  exists to close stays closed.
- **Funder-of-last-resort = flipped round's forfeited juror fees.** Rejected
  — it taxes the vindicated minority jurors who were coherent with the final
  ruling; the bounty must not weaken the coherence payoff it rides on.
- **Refund the appeal fee on flip.** Rejected by all precedent (fee = juror
  compensation for work performed; refunding makes correct appeals free →
  appeal spam, unpaid panels).
- **Kleros-style option-indexed crowdfunding (two-sided funding, winner-share
  -loser).** Deferred, not rejected — the strongest form of correction
  incentive (pools small interests; makes watchtowers profitable). The
  bounty pool + finality-time disposition built here is the substrate it
  would extend; it needs its own ADR + grilling (funding-period state,
  contribution accounts, default-win semantics).
- **Optional / per-Subaccord bounty.** Rejected — fragments the mechanism
  (pools with no filer +1 resurrect the lone-flipper gap) for a knob nobody
  has asked to tune.

## Consequences

- The lone successful appellant's floor improves from
  `−N_new·fee` to `−N_new·fee + bounty share` (e.g. round-1 lone flip:
  recovers bond + 2·fee → net −6·fee instead of −7·fee, at
  `fee_per_juror`-scale pricing). **This is a subsidy and an architecture,
  not full compensation** — flipping is still net-negative absent failed
  challenges; profitability for correctors arrives only with crowdfunding.
- **No extraction vector:** a colluding filer+appellant only recycles their
  own deposits; the pool's only external funding is failed appellants, who
  pay 2·N·fee each to feed it. Adversarially funded by construction.
- Juror incentives are untouched (fee_token bounty, no slash interaction);
  ADR-0004's party-agnosticism is intact (rule reads only round results,
  `AppealBond.prior_result`, `final_ruling` — never party identity).
- `Dispute` gains `bounty_pool: u64` (consume existing padding if the
  64-byte reserve allows — accord-8k60; else a pre-mainnet space bump is
  acceptable) and `AppealBond` gains `reward: u64`. IDL/SDK/cranker/CLI/
  skill-docs coupling per AGENTS.md; `.qedspec` gains the pool-conservation
  invariant; Canon + Synod tender updates with their e2e.
- ADR-0004 consequence line ("a forfeited bond goes to the Coherent Jurors")
  is amended: the bounty +1 is a separate, earlier claim on the appellant's
  deposit; the bond forfeit rule itself is unchanged.

## References

- ADR-0029 (finality-conditional fees — the plumbing this rides on),
  ADR-0018 (final-ruling coherence — here extended to appeals), ADR-0004
  (permissionless, party-agnostic appeal), ADR-0020 (two-mint custody).
- Appeal-economics audit 2026-08-31: Kleros v2 `fundAppeal` /
  `withdrawFeesAndRewards` (winner-share-loser — the deferred stronger form),
  Aragon collateral-to-vindicated-appealer precedent, UMA correct-disputer
  rewards.
- 2026-08-31 owner grilling: reject Arbitrable-layer dependency; multi-flip
  rule (a)∧(b).
