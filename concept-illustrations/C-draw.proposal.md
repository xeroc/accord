# Group C — Randomness and the Draw: Motion Illustration Proposals

Three looping, silent, inline explainer animations for the Accord docs site: **C1** stake-weighted sortition (probability made physical), **C2** the MST accumulator (locality made visible), **C3** VRF delivery + root freeze (the manipulation-proof timing). Audience is developers/integrators: smart, skeptical, allergic to fluff. Every beat below is written so a motion designer or engineer can build it without re-reading the ADRs.

---

## Group preamble — Brand Motion Identity (shared family constants)

Derived from the **Corporate** archetype (clean, professional, zero-overshoot — the right register for a security-adjacent protocol) with **Premium** as a strictly rationed accent: at most **one** slow dramatic reveal per loop, spent on the concept's single most important instant (the dart landing, the root landing, the freeze dropping). Overshoot reads as uncertainty; nothing in Accord's draw is uncertain after it commits, so nothing bounces.

**1. Signature easing** — `cubic-bezier(0.2, 0, 0, 1)` (MD3 standard) carries ~80% of all motion: sweeps, arcs, ticks, wipes.
- Entrances: `cubic-bezier(0.05, 0.7, 0.1, 1)` (MD3 Emphasized) — decelerating arrival.
- Exits: `cubic-bezier(0.3, 0, 1, 1)` (MD3 Accelerate) — 30–50% shorter than the matching entrance.
- Ambient: sine ease-in-out, seamless.
- **The chance accent**: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo) — reserved *exclusively* for VRF-derived randomness in motion (the dart in C1, the veiled value in C3). Family rule: **only chance moves like chance.** Everything else is deliberate.

**2. Duration palette** — quick **160ms** (ticks, odometer steps, flashes) / standard **320ms** (chips, tokens, wipes) / slow **640ms** (reveals, captions). Dramatic-reveal budget ≤ 960ms, used once per loop. Distance scales duration (100px = base; 200px = ×1.3; 400px = ×1.6); anything traveling > 1/3 of the artboard gets an intermediate keyframe (an arc apex or a label settle).

**3. Entrance pattern** — "materialize from the datum": opacity 0→1 plus a 10px offset away from the layout datum (upward for chips and captions, rightward for sequence messages), MD3 Emphasized ease. Hero enters first and alone; secondary elements follow at 40–90ms stagger; ambient is pre-existing at low amplitude. Stagger totals never exceed 500ms.

**Reset pattern ("reset breath")** — every loop ends with a 400ms crossfade back to the start pose (exits staggered 20ms, accelerate ease). End pose ≡ start pose, and ambient sine periods divide the loop length evenly, so the seam is invisible.

**Semantic motion states** (shared vocabulary so all six groups merge into one family):
- **LIVE** = tinted + breathing (±3–4% opacity, 3.5–4s sine)
- **FROZEN / CANONICAL** = desaturated, perfectly still, optional frost overlay
- **DRAWN / EXCLUDED** = diagonal hatch wipe
- **FAILED / REJECTED** = one flat amber flash, no shake (errors feel firm, resolved)
- **CHANCE** = chance-accent easing only

**Loop discipline** — 6.4–8.0s per loop, hidden seam, no visible loop counter. **Reduced motion** — every animation ships a static keyframe of its most informative frame, plus at most one 400ms crossfade variant.

Artboards are specified per concept and scale via `viewBox`; minimum legible width 320px.

---

## C1. Stake-weighted sortition — the number line

**Emotional target:** "Fairness you can physically see" — a weightless dart against an immovable ruler; the randomness feels real, the weights feel honest, and the outcome feels *earned by geometry*, not granted by authority.
**Motion personality:** Corporate base (the ruler never moves, never bounces — deterministic trust) with the family's chance accent as the single expressive element: the dart is the only thing in the scene that moves like chance, because it is the only thing that *is* chance. Micro-story: measure (setup) → throw (action) → seat claimed, collision re-derived (resolution).

### Storyboard

Artboard 640×360. Ruler baseline at y=210, x∈[60, 580] (520px). Five Juror segments, widths ∝ stake: P 12% (62px), Q 8% (42px), R 45% (234px), S 25% (130px), T 10% (52px). Seat row at y=300 (two 48px slots). Dart = 18px needle-teardrop.

1. **0.00–0.80 — Ruler assembles.** Baseline draws left→right (scaleX 0→1, 480ms, signature ease); the five segments fade in and rise 8px, staggered 60ms from 0.16s (each 320ms, entrance ease); endpoint labels `0` and `total_stake` fade at 0.55. Nothing else exists yet. → *Understand: total stake is a ruler; each Juror owns a slice proportional to stake.*
2. **0.80–1.35 — Density sweep (probability made physical).** A soft luminance wave crosses the ruler L→R (550ms, signature ease); each segment's bar bumps +4px in height as the wave passes (peak stagger 90ms by position), then settles. → *Understand: width = probability mass — R is simply a bigger target.*
3. **1.35–2.05 — VRF handoff.** A `committed_vrf` chip materializes above-left (standard entrance); four hex nibbles odometer-flicker (4 steps × 40ms + settle, 240ms total); the dart fades in pinned at x=60 (the r=0 end), 160ms. Caption: `r₀ = vrf % total_stake`. → *Understand: one uniform random value over [0, total_stake) — nobody chose it.*
4. **2.05–2.75 — The throw (hero beat).** Anticipation: dart pulls back 14px along its flight line (120ms, ease-in). Flight: travels to x=211 (r₀/total ≈ 0.29 — inside R's range [104, 338]) on a 26px-high parabolic arc, 340ms, chance-accent ease, with an apex keyframe satisfying the 1/3 distance rule. Landing: 120ms squash-settle (scale 0.97→1.0, signature ease); a 1px vertical drop-needle marks the landing x. → *Understand: where the dart lands picks the Juror — `prefix ≤ r₀ < prefix + stake`.*
5. **2.75–3.55 — Seat claimed.** Segment R tint-sweeps L→R (200ms); the prefix-math caption fades beneath R's range (240ms): `prefix_R ≤ r₀ < prefix_R + stake_R`; R's Juror token arcs 90px down-right into Seat 1 (320ms, signature ease, 20px arc apex). → *Understand: the hit resolves to exactly one seat.*
6. **3.55–4.20 — Exclusion.** A diagonal hatch wipes across R L→R (280ms) with tag `drawn — excluded` (160ms). The ruler's widths do **not** change. → *Understand: sampling without replacement — the winner leaves the pool.*
7. **4.20–5.90 — Collision and re-derivation (the "never re-roll slots" beat).**
   - **7a, 4.20–4.75:** dart #2 throws on a compressed repeat (240ms — the viewer knows the pattern now) and lands at x=280, *inside R's hatched range*.
   - **7b, 4.75–5.05:** dart #2 flattens with one flat amber flash; `collision` tag (160ms); the `draw_attempt` odometer ticks `0 → 1` (160ms); the dart dissolves (160ms, exit ease).
   - **7c, 5.05–5.90:** hex nibbles re-flicker (200ms); dart `r₁` throws (340ms, chance accent) to x=402 — inside S's live range [338, 468] — and settles. → *Understand: on collision the seed re-derives via `draw_attempt`; the ruler itself is never re-rolled, re-normalized, or reshaped.*
8. **5.90–6.55 — Seat 2 claimed.** S tint-sweeps (200ms); S's Juror token arcs to Seat 2 (320ms); hatch wipes S at 6.30. → *Understand: the second seat is drawn from the same fixed ruler minus drawn Jurors.*
9. **6.55–7.20 — Reset breath.** Hatches, tags, darts, needles, and seat tokens crossfade out (400ms, exits staggered 20ms); the ruler returns to its neutral post-assembly pose — pixel-identical to the state at 0.80s. → Loop closes invisibly.

### Motion spec

- **Primary layer:** the two dart flights + the winning segments' tint sweeps.
- **Secondary layer:** Juror token arcs, hatch wipes, hex/`draw_attempt` odometers, drop-needle, tags and captions.
- **Ambient layer:** ruler tick-mark shimmer (±3% opacity, 3.6s sine — exactly 2 cycles per 7.2s loop); live segments breathing ±3% opacity (3.6s sine, phase-offset per segment); background grid static.
- **Easings:** signature for sweeps/arcs/tokens/settles; entrance ease for all materializations; **chance accent only for dart flights**; exit ease for dissolves. The amber collision flash is instant-on/160ms-off — no shake.
- **Durations/stagger:** as timestamped above; cascades 60ms (segments), 90ms (density wave), 20ms (reset exits) — all within the 500ms stagger budget.
- **Load-bearing principles:** *Anticipation* (the 120ms pull-back makes the throw readable as chance, not teleportation), *Follow-through* (squash settle sells the landing), *Staging* (the ruler is a still, centered anchor so all attention rides the dart), *Arc* (parabolic flight with apex keyframe), and repetition-compression (second throw 30% shorter — the choreography rule that repeats read faster).
- **1/3 rules:** dart crosses ~30% of artboard width → one intermediate apex keyframe; during beat 7 only dart + odometer are in motion (2 of ~12 elements).

### Loop & interaction model

End pose is the neutral assembled ruler (identical to t=0.80), with ambient sines phase-matched across the seam (periods divide 7.2s exactly). Optional affordances: **hover pauses** the loop at the current beat; **cursor near the ruler** scrubs a ghost dart whose tooltip shows the hovered segment's `prefix ≤ r < prefix + stake` math (turns the illustration into a playable ruler); click re-throws with an alternate committed r (cycling r₀/r₁/r₂), optional.

### Reduced-motion fallback

Static keyframe = the beat-8 state: five labeled segments, dart #1 pinned in R with drop-needle, R and S hatched `drawn — excluded`, Seat 1 holding R's Juror token and Seat 2 holding S's, prefix-math caption visible, `draw_attempt 1` chip shown. Ship one crossfade variant only: pre-draw frame → post-draw frame (single 400ms fade).

### Implementation notes

**Vehicle:** inline SVG driven by a GSAP timeline (odometer hex flickers, dash-offset hatches, pause/scrub/re-throw affordances need seekable timeline control; CSS-only auto-playing fallback acceptable). **Complexity: M.**
**Risks:** label crowding below 420px (merge sub-8% segments into an "other" break glyph); hatch legibility at 320px (2px stripes at 45°, test at 1× and 2×); the collision beat must read as *protocol working as designed*, not error — flat single flash, immediately followed by re-derivation, never a shake; dart travel distance vs. artboard must keep the apex keyframe or the flight reads linear/robotic.

---

## C2. The MST accumulator (root on-chain, tree off-chain)

**Emotional target:** "Calm locality" — a big living system where one change touches exactly one path; the feeling of *O(log N)* before the viewer ever reads the caption.
**Motion personality:** Corporate throughout (measured hops, discrete verification steps — hashing is discrete, so the ripple is stepped, never a continuous slide), with the one Premium beat spent on the root landing in the 45-byte on-chain box. Micro-story: two worlds (setup) → one stake, one path (action) → canonical root, old model struck out (resolution).

### Storyboard

Artboard 640×360. Left: on-chain account card 150×150 at x=48 showing the Subaccord's accumulator fields — `root_hash`, `total_stake`, `next_index`, `depth` — captioned `on-chain: 45 bytes`. Right: MST, depth 3, 8 leaves / 15 nodes, root at top centered x≈460; leaves are Subaccord stakes held off-chain by indexers. Historical inset: 160×84 card, bottom-left dead space.

1. **0.00–0.85 — Two worlds establish.** The on-chain card drops in (−12px + fade, 320ms, entrance ease); the divider draws; tree edges stroke-draw root-down, one level per 200ms at 0.15/0.35/0.55 (signature ease); the 8 leaves micro-cascade at 30ms stagger (160ms each). → *Understand: a tiny canonical root lives on-chain; the big tree lives off-chain.*
2. **0.85–1.55 — A stake event.** A `stake +Δ` chip arcs 110px from bottom-right into leaf #3 (340ms, signature ease, 18px arc apex) after an 8px wind-up; the leaf's stake counter odometers 120→140 (200ms) and the leaf tints LIVE. → *Understand: every `stake`/`unstake` is an incremental leaf update — the tree is live.*
3. **1.55–1.95 — Siblings freeze (staging beat).** A one-time frost tint sweeps the 11 off-path nodes (400ms, −60% saturation) with a single `frozen` tag (160ms). → *Understand: only one path is involved in this update.*
4. **1.95–3.45 — The ripple up the path (hero beat).** Three hops (leaf #3 → L2 → L1 → root), cadence 500ms each (300ms travel + 200ms dwell): the node glows, its hex label odometer-flickers (200ms), the outgoing edge flows toward the parent (dash-offset), then the pulse departs. Discrete steps — each hop *lands* before the next begins. → *Understand: the change re-hashes exactly one leaf-to-root path.*
5. **3.45–4.05 — Root lands on-chain.** The card's `root_hash` field odometers to the new hex (240ms); `total_stake` ticks 1,000→1,020; a canonical ✓ stroke-draws (200ms). Caption chip: `O(log N) — one path, not the tree`. → *Understand: 45 on-chain bytes absorb the entire update; the new root is canonical by construction.*
6. **4.05–4.45 — Second event, compressed.** An `unstake −Δ` chip arcs into leaf #6 (240ms — repeat actions compress); leaf odometers down. → *Understand: unstake is the same machinery in reverse.*
7. **4.45–5.85 — Ripple repeats at ~0.6× timing.** Three hops at 330ms cadence along leaf #6's path; root ticks again at 5.55 (`total_stake` 1,020→1,004, odometer 240ms). → *Understand: the pattern generalizes — any leaf, same locality.*
8. **5.85–6.90 — Historical contrast inset.** The `before: posted snapshot` card rises (280ms, entrance ease); two chips pop — `bond`, `fraud window` (120ms stagger); a single strike-line wipes across both (360ms, signature ease); the card dims to 40%. Caption: `root canonical by construction — nothing to withhold or fabricate`. → *Understand: what the accumulator replaced, and why those mechanisms are gone.*
9. **6.90–7.60 — Reset breath.** Frost clears (300ms), tints neutralize, the inset collapses upward (240ms, exit ease), counters return to start values via crossfade; ambient sines phase-matched (3.8s × 2 = 7.6s). → Loop closes invisibly.

### Motion spec

- **Primary layer:** the ripple pulse traveling leaf→root (both events).
- **Secondary layer:** hex/stake odometers, on-chain field ticks, Δ-chip arcs, frost sweep, strike-line, canonical ✓.
- **Ambient layer:** on-chain card border breathing ±3% opacity (3.8s sine — it is a *live* account); leaves micro-floating ±1.5px (6s sine, 150ms phase stagger); faint level guides behind the tree.
- **Easings:** signature for hops/arcs/ticks/strikes; entrance ease for cards and chips; exit ease for the inset collapse; sine for ambient. Hops are (travel + dwell) pairs so the ripple reads as discrete hash recomputations, not a slide.
- **Durations/stagger:** level draw 80ms stagger; leaf cascade 30ms; hop cadence 500ms (event 1) / 330ms (event 2); reset exits 20ms — all within budget.
- **Load-bearing principles:** *Staging* (frost-dimmed siblings make the path the only living thing), *Anticipation* (Δ-chip wind-up), *Follow-through* (the root tick lands 80ms *after* the final hop — consequence, not simultaneity), *Wave* choreography (the hop stagger), and repetition-compression (event 2 at 60% timing reads as "again", not "new").
- **1/3 rules:** ≤4 of 15 nodes in motion at any instant; the Δ-chip travels 110px (under the 1/3 threshold, no extra keyframe needed).

### Loop & interaction model

End pose = assembled neutral tree with start counter values (identical to t=0.85), ambient sines phase-matched across the seam. Optional affordances: **hover a leaf** pre-lights its ghost path to the root with tooltip `an update to this leaf re-hashes 4 of 15 nodes (depth 3)`; a **scrubber** replays either ripple at 0.5× for close reading.

### Reduced-motion fallback

Static keyframe: tree assembled; leaf #3 highlighted LIVE; its path to root lit (three nodes + root tinted, edges solid); siblings frosted; on-chain card showing the updated `root_hash` with a `total_stake +20` delta chip; inset present with `bond` and `fraud window` struck through; caption `O(log N)`. Crossfade variant: before-update frame → after-update frame (single 400ms fade).

### Implementation notes

**Vehicle:** inline SVG + CSS keyframes — stroke-dashoffset ripples, odometer stacks, and staggered cascades are pure CSS; promote to GSAP only if the hover path pre-light or scrubber ships. **Complexity: M** (S if interactive affordances are cut).
**Risks:** 15 nodes + labels at docs width — show hex only on nodes currently rippling, 4 chars + `…` elsewhere; frost must not read as disabled UI (pair it with the one-time `frozen` tag); two events + inset in 7.6s risks crowding — the inset lives in dead space and event 2 reuses event 1's choreography verbatim so it reads as repetition, not new information.

---

## C3. VRF delivery + root freeze (the manipulation-proof timing)

**Emotional target:** "Locked at the perfect instant" — tension of an unknown `r`, the satisfying *snap* of an atomic commit-and-freeze, then calm as both attacks glance off; the viewer should feel *why* this timing is un-gameable, not just be told.
**Motion personality:** Corporate base with the family's Premium budget spent on the freeze-line drop (the single slow dramatic reveal), and the chance accent spent on the veiled randomness itself. Micro-story: request (setup) → atomic commit + freeze (action) → both manipulation windows fail, escape hatch opens (resolution). This is the subtlest concept in the group — the storyboard below spends its best beats here.

### Storyboard

Artboard 720×400 (widest of the family; scale via `viewBox`). Time flows **left→right** along a bottom axis (y=340). Three horizontal lifelines: **cranker** (y=120), **Accord** (y=200), **MagicBlock oracle** (y=280), each with an actor chip at left. The accumulator root is drawn as a small MST glyph (visually quoting C2) riding the Accord lifeline. Freeze line: vertical, full stage height, x=380.

1. **0.00–0.90 — The stage is a timeline.** The time axis draws L→R (480ms, signature ease); the three lifelines fade in with actor chips, staggered 100ms; a `t₀` tick labels the start. → *Understand: this is a story about timing, not topology.*
2. **0.90–1.60 — `request_vrf`.** An arrow draws on (dash-offset, 500ms) from the cranker lane to the oracle lane, labeled `request_vrf`; the cranker chip gives a 3% press-squash as it pays. → *Understand: the draw requests randomness; a cranker triggers it.*
3. **1.60–2.30 — The oracle computes.** An entropy glyph inside the oracle lane spins and decelerates (700ms, ease-out); above it a chip materializes: `r = ??????` — six veiled hex nibbles. Nothing else moves. → *Understand: randomness now exists, and nobody — including a staker watching the mempool — knows it yet. This is the tension beat.*
4. **2.30–3.20 — `commit_vrf_callback` + FREEZE (the hero beat of the whole group).** The oracle→Accord arrow draws on (320ms), labeled `commit_vrf_callback`. On arrival, **in one frame — the two stamps start ≤80ms apart, ideally the same frame**: (a) the `committed_vrf` chip stamps into the Accord lane (scale 1.06→1.0 + flash, 160ms); (b) the **freeze line drops** top→bottom across the entire stage (scaleY 0→1, 360ms, Premium emphasized `cubic-bezier(0.05, 0.7, 0.1, 1)` — the group's rationed slow reveal) after a 150ms pre-drop glow charge; (c) the region right of the line takes a faint crystalline tint and the MST root glyph on the Accord lifeline gains a lock + frost. The entropy glyph's rotation stops **dead** on the frame the line lands. Captions: `atomic: commit r AND freeze root — one instruction` and `freeze at callback, not filing → capital stays live until the last safe instant`. → *Understand: from this instant both draw inputs — r and the accumulator root — are pinned together, and nothing before this moment could see r.*
5. **3.20–4.10 — `draw_seat` × N.** Three small arrows march along the frozen root (stagger 140ms, signature ease, even deterministic cadence), each stamping a seat chip — the round-1 panel. → *Understand: every seat of every Round of this Dispute selects against the same frozen root + committed r.*
6. **4.10–5.30 — Window A: blind (annotated left of the line).** A bracket draws over the pre-freeze region, labeled `window A — blind`. A ghost adversary token descends from top-left and fires a `stake Δ` arrow at the accumulator (angular, straight — path-as-language: attack lines are straight); a **mini number line** (160px, a deliberate visual callback to C1) appears above: its segments reshape twice (widths shuffle, 200ms each), while the dart stays veiled — a `?` orb wanders erratically behind frosted glass (chance-accent wander, never landing). The reshaped ruler and arrow dissolve (240ms, exit ease) with tag `can aim at nothing`. → *Understand: pre-callback you may restake freely, but with r unknown you are moving targets you cannot see the dart for — reshaping is gambling, not biasing.*
7. **5.30–6.40 — Window B: inert (annotated right of the line).** Bracket over the post-freeze region: `window B — inert`. The adversary fires `stake Δ` from top-right — *now r is known, the tempting moment* — the arrow travels, strikes the freeze plane and deflects: it slides down the glass 26px on a curved path and fades (320ms), one flat amber flash on contact; the root chip does not move a pixel. Tag: `no-op — root frozen`; footnote chip: `the live tree moves on; this draw doesn't`. → *Understand: post-callback knowledge is worthless — the root this Dispute draws against cannot be touched.*
8. **6.40–7.30 — The escape hatch.** The oracle lane shows `···` fading (silence); a timeout ring around the Dispute chip fills (700ms); any-cranker arrow `cancel_dispute` flies cranker→Accord (300ms); a `refund` chip pops (scale 0.9→1.0, 180ms). Caption: `a silent oracle stalls — any cranker can cancel → refund`. → *Understand: stall ≠ deadlock; liveness is crankable.*
9. **7.30–8.00 — Reset breath.** The freeze line de-crystallizes (reverse drop, 280ms, exit ease); brackets, chips, seats, and arrows crossfade out (20ms staggered exits); the stage returns to the beat-1 pose; ambient sines phase-matched (4.0s × 2 = 8.0s). → Loop closes invisibly.

### Motion spec

- **Primary layer:** the message arrows and the freeze-line drop.
- **Secondary layer:** `committed_vrf` stamp, lock + frost, seat chips, adversary arrows + glass deflection, timeout ring, refund pop, region brackets.
- **Ambient layer:** entropy glyph idle rotation **while uncommitted only** (it stops dead at freeze — chance stops moving once committed, the family rule made literal); time-axis tick shimmer (±3% opacity, 4.0s sine); frost-plane shimmer ±2% opacity (4.0s sine — exactly 2 cycles per loop).
- **Easings:** signature for arrows/seats/brackets/captions; entrance ease for materializations; **Premium emphasized for the freeze drop** (the one slow reveal); **chance accent only for the veiled `?` wander**; exit ease for dissolves. The deflection starts ease-in (the hit) and exits accelerated (the discard).
- **Durations/stagger:** lifelines 100ms; seat arrows 140ms; reset exits 20ms; all cascades within the 500ms budget.
- **Load-bearing principles:** *Anticipation* (decelerating entropy spin + the 150ms pre-drop glow charge), *Staging* (after the drop, every subsequent motion reads against one static vertical — the line is the protagonist), *Exaggeration* (the inert arrow physically sliding down glass makes "no effect" visceral), *Follow-through* (stamp settles; line crystallizes; entropy halts), *Arc vs. straight* (adversary arrows are straight/angular; the deflection curves — attack vs. futility), and *counter-motion* choreography (draw arrows advance evenly L→R while attacks descend diagonally — the directional conflict reads as adversarial without a single word).
- **Two hard timing rules (the security story depends on them):** (1) the `committed_vrf` stamp and the freeze-line drop begin **≤80ms apart, same frame if possible** — if they visibly stagger, the animation falsely implies two separate writes and undermines the atomicity claim; (2) the entropy glyph's rotation halts on the exact frame the line lands.
- **1/3 rules:** the freeze drop is one full-height element moving ≤1/3 width; during windows A/B only the attack chain + tags are in motion (~1/3 of stage elements max).

### Loop & interaction model

End pose = beat-1 empty-timeline pose; ambient sines phase-matched across the seam. Optional affordances: **hover the freeze line** splits the view into side-by-side ghosts of pre-freeze and post-freeze states (the two failure modes at a glance); **hover any arrow** shows its instruction tooltip (`request_vrf`, `commit_vrf_callback`, `draw_seat`, `cancel_dispute`); clicking an adversary token replays just that window's beat.

### Reduced-motion fallback

Static keyframe = the fully-annotated sequence diagram at loop end-state minus the reset: all four message arrows drawn with labels; freeze line solid with crystalline tint; `committed_vrf` stamped; root glyph locked; three seat chips filled; window A bracket with the veiled `r = ??????` mini-ruler and `blind` tag; window B bracket with the deflected arrow mid-slide, `inert` tag, and unmoved root; `cancel_dispute → refund` at the tail with its caption. Every caption visible — the static frame must tell the whole timing argument on its own. Crossfade variant: pre-freeze frame → post-freeze frame (single 400ms fade).

### Implementation notes

**Vehicle:** inline SVG driven by a GSAP timeline with **named labels per instruction** (`request_vrf`, `commit_vrf_callback`, `draw_seat`, windows A/B) — label-anchored seeking lets docs pages deep-link and pause on the freeze, and only a real timeline gives the frame-exact ≤80ms atomicity guarantee. **Complexity: L.**
**Risks:** information density at docs column width — minimum artboard 720px via `viewBox`, labels ≥11px at 1×, and drop the C1 mini-ruler callback below ~520px width (keep the `blind` tag alone); the atomicity frame must be verified at 60fps and in reduced-motion (a dropped frame there is a factual miscommunication, not a style bug); "inert" must not read as the arrow simply missing — contact flash + the root holding perfectly still + the `no-op` tag together carry the meaning; 8.0s is the top of the family loop budget — if review finds it crowded, compress beat 3 to 400ms and the timeout ring to 500ms (→7.6s) before cutting any content.

---

*All three proposals share the Group C Brand Motion Identity above (signature easing, duration palette, entrance/reset patterns, semantic states, chance accent) so they can merge with Groups A–F into one coherent docs-site motion family.*
