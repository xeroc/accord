# TODO — Protocol & Ecosystem Improvements

Backlog of improvements distilled from competitive research on decentralized
adjudication designs. Ordered roughly by effort × payoff. None of this is
scheduled; each entry states the why so future-us doesn't have to re-derive it.

---

## 1. Appeal economics: make successful appeals *profitable*, not merely cost-neutral

**Where:** `CaseTerms` (per-pool parameter), `settle_round` / `finalize_dispute`
split logic (`programs/accord/src/instructions/`), ADR-0020/0029 follow-up.

**Change:** A successful appellant receives their bond back **plus a bounty**
(e.g. a fixed multiple of the bond, or a share of the forfeited incoherent-side
stakes) paid from the fee pot / forfeitures.

**Why:** Today an appeal is at best cost-neutral for the appellant — bond back,
time and attention gone. Under cost-neutrality, the *only* party motivated to
appeal is the losing disputant, and they appeal because they lost, not because
the ruling was wrong. That's the worst possible sensor: biased by construction,
blind to ruling quality. A wrong-but-uncontested ruling becomes final simply
because nobody's incentive aligned with correcting it. Paying whistleblowers out
of the losing side's forfeitures turns every staked juror, every observer, and
every future user of the pool into a potential quality check on rulings — the
same crowd that profits from coherence is paid to police it. The cost is zero
when rulings are good; it only bites when a ruling actually flips.

**Risk to check:** Sybil-appeal farming is bounded by the fact that the bounty
only pays on a *successful* flip, and a flip requires a fresh draw to disagree
with the original — you can't manufacture that without actually winning over an
independent committee.

---

## 2. Appeal redraws must never re-draw jurors from earlier rounds of the same dispute

**Where:** Draw filter in the appeal path (`instructions/` + MST accumulator
selection utils). Start with an **audit**: confirm whether an appeal redraw can
currently land on a juror who served an earlier round of the same dispute.

**Why:** The entire value of escalation is *fresh, independent* re-examination.
If an appeal can redraw the same jurors — or a subset of them — then whatever
correlated error, shared bias, or outright collusion produced the first bad
ruling gets a second chance to confirm it. Escalation that recycles the
committee isn't escalation; it's the same mistake with more stake behind it.
Excluding consumed jurors also compounds with committee growth per round: each
level is *provably* uncorrelated with the last, which is the property that makes
a sustained wrong answer expensive enough to be irrational.

**Cost note:** Exclusion shrinks the eligible pool per round; with
`MAX_JURORS`-sized pools and multi-round disputes this could exhaust a small
Subaccord. Pair the exclusion with a floor check and a clear error if the pool
can't supply a fresh committee.

---

## 3. One atomic appeal operation: quote → fund → submit

**Where:** `packages/sdk/src/methods/appeal.ts` facade, `apps/cli` `appeal:open`.

**Change:** A single high-level SDK/CLI operation that reads the on-chain
appeal cost (bond + next-round funding) *and* submits, binding to the dispute's
current state atomically — or at least validating quote freshness at submit
time. The two-step "fetch cost, then submit what you fetched" flow is a race
against both the appeal window and any state that mutates the cost.

**Why:** Every gap between "what the user was quoted" and "what the chain
expects at submission" is a revert the user experiences as *the window closing*.
An appeal that fails on a stale quote doesn't just cost gas — the appellant may
lose the only chance to challenge, which is a protocol-level failure surfaced as
a UX-level annoyance. Appeals are low-frequency, high-stakes, and usually
executed under emotional load by non-experts; this path should be impossible to
get wrong. Document any low-level variant as expert-only with the failure mode
spelled out.

---

## 4. Arbitrable author guidance: effects before vs. after finality

**Where:** `apps/docs/` (integrator guide), `programs/*/SPEC.md` cross-links.

**Why:** An appeal can flip the ruling until the dispute settles against the
final ruling (ADR-0018) — that's the correct protocol design, but it means an
Arbitrable that acts on a *provisional* ruling is holding reversible risk. Today
every integrator has to rediscover this distinction the expensive way. One
canonical doc section — "effects safe before finality (display, reputation,
non-binding signals) vs. effects that must wait (irreversible payouts, state
commitments, external transfers)" — converts a class of integration bugs into a
read. We already win vs. designs that recompute dependent transactions on
appeal; the doc is what makes that advantage *legible* to builders choosing an
arbitration primitive.

---

## 5. Ruling-comparison helpers as one-call SDK surfaces

**Where:** `packages/sdk/src/methods/` (new comparison/codec helpers), consumed
by `packages/{canon,synod}`, `apps/*`.

**Change:** Ship first-class helpers for the common comparison policies —
binary ruling, scalar-median (ADR-0025), tolerance-band — so an Arbitrable
never hand-rolls its own "interpret a `Ruling` / compare juror answers" logic.

**Why:** Hand-rolled comparison logic is exactly where our recurring bug class
lives: canonical-JSON and undefined-key desyncs between what one side signed
and what the other side compares. Every new hand-rolled comparison is a fresh
instance of a bug we've already paid for several times. The policies exist in
the program; the SDK should make the boring choice the one-liner. This also
keeps a single source of truth for how rulings are encoded/compared, which the
change-coupling rules then protect going forward.

---

## 6. Juror model diversity in the AI juror daemon (`apps/jurat`)

**Where:** `apps/jurat` model-selection config.

**Change:** Vary the LLM (and prompting where sensible) *per juror per dispute*,
and never disclose which model served which juror.

**Why:** If every AI juror in a draw runs the same model with the same prompt,
the Schelling point collapses onto "whatever the model says" — the VRF draw
gives surface-level decentralization while the *judgment* stays fully
correlated. One adversarial prompt-injection or one model quirk then moves the
entire panel in lockstep, and coherence payouts reward the herd for being wrong
together. Model diversity across the draw restores genuine independence between
votes — the precondition for the whole honesty equilibrium to mean anything.
Keeping assignments undisclosed denies an adversary the ability to target the
specific model any given juror runs.

---

## 7. (Strategic, optional) `builder_bps`: usage-linked revenue for Arbitrable deployers

**Where:** `CaseTerms` field + `settle_round` fee split, SDK + SPEC + e2e
ripple.

**Change:** Per-Subaccord field routing a small slice of the `fee_vault` pot to
the Arbitrable deployer's wallet.

**Why:** The protocol's growth is gated on Arbitrables being built — every
dispute filed is CPI'd in by one. Today a builder integrates us for free and
carries all the integration cost; grant-style funding doesn't scale and pays for
promises, not adoption. A usage-linked share means the ecosystem pays builders
exactly when the ecosystem grows, with zero marginal cost when it doesn't. Flag
as strategic: only worth doing if Arbitrable supply is the binding constraint —
revisit after the first third-party integrations land.
