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

---

## 8. BLS12-381 syscalls (SIMD-0388): harness probe first, then authority aggregate multisig

**Where:** syscall bindings in `programs/accord` (the 5-arg `sol_curve_pairing_map` — pinocchio ≤0.10 binds the old 3-arg form, so `define_syscall!` directly; `solana-bls12-381-syscall` 0.1.1 is already in `Cargo.lock` transitively), Subaccord authority path (`propose_subaccord_update` / `execute_subaccord_update`), test harness (`make test_unit` LiteSVM + Surfpool e2e).

**Change:** (a) **Probe the harness before anything else** — a ~20-line instruction calling `sol_curve_group_op` through `make test_unit` plus one Surfpool e2e. Our litesvm is 0.16/agave 4.2 (xeroc fork) and surfpool ≥1.7, so the syscalls are *probably* available, but unproven: Anza's own crypto-primitives-examples could not use surfpool/litesvm (both pinned to agave 3.1, syscalls absent) and fell back to Mollusk. If Surfpool lacks the activated feature set, the green-rule e2e mandate blocks shipping any BLS path until it catches up — better to know on day one. (b) **Subaccord authority aggregate multisig**: members' G2 keys folded into one running aggregate point on-chain (G2 add/sub ≈ 375 CU per fold), N approvals landing in a single tx, one pairing check (~43k CU) regardless of N. Replaces today's single authority key per Subaccord.

**Why:** SIMD-0388 is **Activated — live on mainnet since epoch 986** (128-bit security vs BN254's ~100-bit). It gives G1/G2 add/sub/mul, point validation, decompression, and batch pairing (max 8 pairs/call); no Poseidon and no on-chain hash-to-curve. Juror auth today is runtime-verified Ed25519 — free — so BLS pays only where the runtime can't give the semantics: aggregation, threshold, pseudonymity. Authority multisig is the boring, isolated first win: no account-schema change, no consumer ripple, real governance hardening. It's also the exact pattern Anza's registry demo proves on-chain.

**Gotchas to carry into any implementation:** clients must supply H(m) as a point (no on-chain hash-to-curve) — bind messages via the point bytes and reject identity points (`e(O,Q)=1` would forge). Measured CU (Anza, Mollusk/agave 4.3): G1 add ~300, G2 add ~375, G1/G2 mul ~4.8k/8.4k, 2-pair verify ~42.7k.

---

## 9. Pseudonymous juror panels via BLS-keyed accumulator leaves

**Where:** MST leaf format (`LeafClaim` — `H(juror ‖ stake)` → `H(bls_pk ‖ stake)`), `draw_seat` (publishes `leaf.juror` into `round.jurors` and emits `SeatDrawn { juror }`), `commit`/`reveal` (signer auth → BLS signature verify), `JurorStake` PDA seeds, ADR-0024 attestation gate (binds credentials to the Pubkey), events surface.

**Change:** the accumulator leaf commits to a juror-controlled BLS pubkey instead of the Solana Pubkey; registration requires **Proof of Possession** (sign `H(pk ‖ domain)` — the rogue-key defense, the same pattern the SIMD itself mandates for validator key registration). `draw_seat` records the leaf index + G2 point, never a wallet. `commit`/`reveal` authorize via `e(σ, g₂) =? e(H(c), bls_pk)` (~43k CU); the drawn juror recognizes their own leaf, nobody else can link leaf #N to a wallet. `JurorStake` reseeds from `hash(bls_pk)` so `slash_reserve`, fee claims, and `withdraw` authorize by key possession rather than tx signer.

**Why:** today `draw_seat` publishes the panel at draw time (`round.jurors[seat] = leaf.juror`, `SeatDrawn { juror }`) — commit-reveal hides the *vote*, never the *voter*, so the panel is public through the entire bribe/coerce/DDoS window between draw and reveal. BLS-keyed leaves close the **on-chain** leak: accountability (stake, slashing) stays, linkability between wallet and vote goes. This directly addresses ADR-0001's noted PII surface for sensitive Subaccords — the "eventually KYC'd" concern becomes *unlinkable to the vote* rather than nonexistent.

**Honest limits (state these in the ADR):** the staking-layer link remains — whoever watched wallet W create leaf #417 knows, so deposit hygiene (fresh wallet per stake, relay) is off-chain scope; fee withdrawal to the staking wallet re-correlates, mitigated by timing separation (withdraw post-finality, stealth-address style); ADR-0024's credential gate needs rework for pseudonymous members. This is an ADR-worthy redesign of stake/draw/commit/reveal/settle, triggered by actual Subaccord demand for panel privacy — not a patch.

---

## 10. Explicit non-goals from the SIMD-0388 review (so future-us doesn't re-derive)

**More jurors via BLS — no.** `MAX_JURORS = 31` is bounded by the `Round` account size (~2.7 KB fixed arrays `jurors/commits/seat_prefix/seat_stake/reveals`), the 2N+1 appeal ladder (odd = no binary ties, ADR-0026), and one-seat-per-tx `draw_seat` (a 1232 B tx can't hold N Merkle proofs). None of these are cryptographic constraints; raising panel size is an account-layout + draw-protocol redesign orthogonal to BLS. Aggregate BLS vote verification (O(N) pairings ≈ 21k CU/pair, ~2M CU for 100 votes in one tx) removes a signature-verification bottleneck that doesn't exist today — per-juror Ed25519 is free at the runtime.

**Threshold BLS beacon replacing the magicblock VRF — no.** t-of-n setup over a rotating staked pool is research-grade coordination; the VRF works.

**Groth16-on-BLS12-381 (ZK "I'm a drawn juror and my vote counts") — parked.** The pairing syscall makes an on-chain Groth16 verifier possible in principle, but Poseidon is out of SIMD-0388's scope, so circuit hashing falls back to expensive in-circuit SHA-256. Revisit when tooling matures. If the ask is *hidden votes* rather than *hidden voters*, the ZK ElGamal proof program (SIMD-0153, mainnet since epoch 731, ~6k–111k CU/proof) is the lazy path.

**Evidence-daemon re-encryption DLEQ proofs via pairing (`e(σ₁,P₂)·e(−σ₂,P₁) = 1`) — skipped.** Cute for ADR-0015, but the operator-keyring trust model doesn't demand on-chain proof of correct re-encryption.
