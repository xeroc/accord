---
# accord-s72c
title: Two-party filing with stake + asymmetric stake multipliers (later version)
status: draft
type: task
priority: normal
created_at: 2026-08-06T02:35:45Z
updated_at: 2026-08-18T05:00:56Z
---

PARKED — later version. Accord today is SINGLE-FILER: one party files a dispute (no adversarial submitter-vs-challenger staking). Asymmetric stake multipliers (winner-stake-mult < loser-stake-mult), challenger-deposit/bounty economics, and registry removal-vs-submission deposits only become meaningful once Accord supports TWO parties filing with stake. Scope this extension when two-party adversarial filing is on the roadmap. Note: also enables curated-list challenger mechanics. Source: Kleros-blog-audit session 2026-08-06.

## Scoping session 2026-08-18 — first slice: symmetric two-party deposits + optional respondent

Scope split agreed-in-principle: THIS bean's first slice = option-order convention, optional named respondent, party deposits + winner/neutral claim routing. Still parked: asymmetric stake multipliers, challenger bounty economics, party-custodied appeal funding (Kleros default-judgment-on-solo-appeal).

### Load-bearing facts from code (2026-08-18)

- final_ruling IS the winning option index (finalize_round Plurality tally); convention needs zero schema change.
- TIE-BREAK: tally uses .max_by_key() → tie resolves to HIGHEST option index → respondent wins ties under the convention. Must be decided explicitly (neutral vs respondent-favored).
- Median (ADR-0025) rulings are scalars — party mapping undefined. Gate respond on Plurality only.
- Juror fees leave the vault at reveal (ADR-0018) — winner fee reimbursement must be funded from loser's deposit, never from fees.
- No-flip appeal bonds → coherent jurors (ADR-0004) — UNCHANGED in this slice; appeals stay permissionless.

### Proposed convention (decision needed)

- options[0] = filer right; options[1] = respondent right; options[2..] = neutral (split/refuse/invalid) → both deposits back minus fee shares.
- winner_claim = p1_dep + p2_dep − panel_size(round0)·fee_per_juror; neutral: own_deposit − own_fee_share (50/50 both joined, 100% filer solo).
- Payout via idempotent claim_party_payout (pull), mirrors claim_appeal_refund. fee_vault must always cover outstanding claims (invariant).

### State additions (~57 bytes on Dispute)

- respondent: Pubkey (sentinel DEFAULT_PUBKEY = none) — NAMED at filing, join gated signer==respondent (no open join: stranger-defense misroutes Arbitrable consequences).
- respond_by: i64 — draw gated until now ≥ respond_by || respondent joined. NO new DisputeState; gate lives in draw.
- party_deposits: [u64;2]; respondent_evidence: [u8;32] (join carries counter-evidence hash).
- require_respondent (per-Subaccord, frozen to CaseTerms): timeout → cancel+refund vs proceed single-party. OPEN.
- Join window length: CaseTerms-frozen param.

### Hard rules

- NO default judgment against an absent respondent (join is optional → default-against-absentee = griefing machine). Solo case proceeds, forfeit pool empty.
- reject respondent == filer (decide).
- Party-as-juror: no draw exclusion possible (MST weights); v1 = accepted risk, partial option = reject party reveal (counts no-show). Kleros precedent: no exclusion.

### Open questions

1. Tie-break ownership: respondent (current max_by_key) vs neutral landing.
2. require_respondent flag — Canon's challenger/submitter case decides it.
3. Loser stake destination: 100% winner (Kleros default) vs shared with coherent jurors.
4. Solo-filer fee: eats full round-0 fee (current behavior default) vs half-refund at timeout.

### Blast radius when implemented

New instruction → codegen → SDK facade/pda.ts → CLI command → .agents/skills/useaccord docs → LiteSVM TDD + e2e spec → accord.qedspec → SPEC tables → ADR amending 0004 (party-agnostic default stays: sentinel respondent = today's behavior) → CONTEXT.md glossary → every Dispute fixture (struct grows).

## REWRITTEN SCOPE (2026-08-18 — supersedes content above)

RESOLVED by the PROG-MULTI-PARTY grilling session (meta/specs/PROG-MULTI-PARTY.md, DESIGN CONCLUDED): two-party filing is NOT an Accord-Core extension. Accord stays party-agnostic (ADR-0004 untouched); the party economics live in **Synod** — the N-party dispute escrow Arbitrable, scaffolded at programs/synod/ with the build spec in programs/synod/SPEC.md. Everything from the 2026-08-18 morning scoping session (on-Accord respondent, Dispute +57 bytes, ADR-0004 amendment, option-order convention inside Accord) is DEAD.

Extracted from this bean into build work:

- Tie handling (needing multi-option support) → Accord Core change, bean accord-n3vw (tie → RedrawEligible → Failed; no tie_policy).
- All party/roster/stake/fee/payout design → Synod v1 (programs/synod/SPEC.md).

STILL PARKED here (Synod v2 candidates, only on concrete product pull — do not schedule speculatively):

- Asymmetric stake multipliers (winner-stake-mult < loser-stake-mult)
- Challenger-deposit / bounty economics (Stake-Curate style)
- Party-custodied appeal funding (Kleros default-judgment-on-solo-funder) — explicitly rejected for Synod v1
- Backers/sponsors topping up a party's side (back(party, amount) seam)

This bean stays open as the parking lot; nothing in it requires Accord-Core changes anymore.
