# Group F — Robustness & failure modes: motion-illustration proposals

Seven self-contained looping explainers (~6–8 s each, silent, inline on docs pages) for the failure-mode and safety concepts F1–F7. Group register: **reassurance-through-rigor** — every stall, gate, freeze, and assumption is shown calm, bounded, and priced. Nothing flashes; nothing alarms. The motion itself argues that the system degrades to refunds, never to capture.

---

## Group F preamble — Brand Motion Identity

Mergeable with groups A–E: this identity is derived from the Corporate/Premium archetypes for a security-adjacent protocol docs site and uses only standard curves, so sibling groups can adopt it verbatim.

**Archetype.** Corporate chassis, Premium resolve. 80 % of all moves are Corporate — clean, decisive, 0–3 % overshoot — because the subject is an instrument that behaves deterministically. Resolution beats (a Ruling landing, a refund arriving, a snapshot stapling) shift to Premium pacing (350–600 ms, `cubic-bezier(0.4,0,0.2,1)`) so every safety mechanism ends on a controlled, elegant settle rather than a snap.

**Signature easing (the family constants):**

| Token | Curve | Use |
|---|---|---|
| `accord-move` | `cubic-bezier(0.2, 0, 0, 1)` | 80 % of moves — MD3 "snappy", rigid-material feel (0 % overshoot) |
| `accord-hero` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | hero steps and entrances (MD3 Emphasized) |
| `accord-exit` | `cubic-bezier(0.3, 0, 1, 1)` | dismissals, reset crossfades (MD3 Accelerate) |
| `accord-settle` | `cubic-bezier(0.4, 0, 0.2, 1)` | Premium settles, refund landings |
| `accord-breath` | sine ease-in-out | all ambient breathing |

Linear easing is reserved strictly for scanner-semantics elements (countdown rings, scan sweeps, progress drains) where constant rate *is* the message.

**Duration palette (illustration tempo).** Interaction-table durations scaled ×~1.7 because these loops are watched, not operated: **quick 280 ms** (state flips, gate closings, chips) / **standard 480 ms** (token travel, dial turns) / **slow 800 ms** (reveals, rulings, band fills). Entrances run 30–50 % longer than exits; reset crossfades are 400 ms `accord-exit`.

**Entrance pattern — "rails before actors."** Structure draws first: axes, pipes, spines, and tree edges stroke-draw over 600–900 ms; then actors (tokens, dots, dials) enter with a 16 px rise + fade (`accord-hero`), staggered ≤ 120 ms, all from a bottom-left origin. The viewer always receives the coordinate system before anything moves through it — staging is the family's most load-bearing Disney principle.

**Loop model — intro-once, core-loop.** Every illustration is two timelines: an **intro** (the structural draw-in) that plays once on mount, and a **core loop** whose final frame is pixel-identical to its first frame, ending with a 300–500 ms still hold before a 400 ms `accord-exit` crossfade into the matched restart pose. No loop ever visibly "rewinds."

**Color-motion semantics (restraint rules).** Muted crimson = boundary/slash (never oscillates faster than 0.33 Hz, never a flash); teal = refund, escape, paid; amber = pending/timeout/expiry; cool slate = frozen/immutable. Red communicates containment, not danger.

**Layer & amplitude budgets.** Three motion layers mandatory: primary (the one action to follow), secondary (chips, slashes, counters, echoes), ambient (breathing 3–4 s sine cycles at ≤ 15 % of primary amplitude, phases offset so elements never sync; ≤ 20 ambient elements; transform + opacity only).

**Family reduced-motion rule.** `prefers-reduced-motion` renders the core loop's most informative single frame — fully resolved, all labels legible, no breathing, no sweeps — as a static SVG (or a single ≤ 400 ms crossfade between intro and that frame). Per-concept frames specified below.

---

## F1. The `(round_idx, draw_attempt)` grid

**Emotional target:** clarity — "these are two different axes with two different costs," the conflation dissolves as the path visibly behaves differently in each direction.
**Motion personality:** Corporate — a precision instrument panel; straight, purposeful path language (diagonal-free steps), 0 % overshoot, every step accounted for by a chip.

**Storyboard** (core loop 7.0 s; intro 0.9 s once)

Grid orientation: X (left→right) = `round_idx`, the appeal axis; Y (top→bottom) = `draw_attempt`, the redraw axis. Each cell holds a panel dot-cluster sized by panel(r): column 0 = 3 dots, column 1 = 7, column 2 = 15. Terminals: right edge plate "appeals exhausted → Ruling stands"; bottom edge plate "attempts exhausted → `Failed` + filer refund".

1. **0.0–0.9 s (intro, once).** Axes stroke-draw (700 ms); axis labels `round_idx → appeal` and `draw_attempt ↓ redraw` rise 16 px + fade (`accord-hero`, 120 ms apart). *Viewer: this is a coordinate space, not a timeline.*
2. **0.0–0.8 s.** Panel clusters pop into cells column-by-column: scale 0.6→1, 280 ms `accord-move`, 80 ms column stagger, 40 ms intra-cluster dot stagger. Row cells in a column are identical. *Viewer: panel size grows only along `round_idx`; moving along `draw_attempt` changes nothing about size.*
3. **0.8–1.3 s.** A dispute token (small scale-glyph) materializes at (0,0): 320 ms `accord-hero` scale+fade. *Viewer: one live dispute walks this grid.*
4. **1.3–2.5 s.** Redraw step: two juror dots in (0,0) tint muted crimson and take slash marks (180 ms); a chip reading "plurality tie" (alternate loops: "reveal-quorum shortfall") fades in; token steps **down** to (0,1) — 480 ms `accord-hero`, straight vertical, one cell. Cell (0,1)'s cluster is the same 3 dots; a size badge "3" persists. *Viewer: redraw = same panel, no-shows slashed, no bond, attempt counter +1.*
5. **2.5–3.5 s.** Appeal step: a bond chip "2× bond" pays (scale 0.8→1, 200 ms); token steps **right** to (1,0) — 480 ms; the column-1 cluster lands with a 5 % scale settle; attempt badge resets to 0. *Viewer: appeal = panel doubles and a bond is burned; the draw-attempt clock resets.*
6. **3.5–4.5 s.** Second appeal: bond chip "4× bond", token to (2,0), 15-dot cluster, then the token exits the right edge onto the terminal plate; "Ruling stands" checkmark stroke-draws (280 ms, Premium settle). *Viewer: terminal one — spending the appeal budget ends in a Ruling.*
7. **4.5–5.9 s.** Ghost replay at 60 % opacity: a second token re-runs the alternate path from (1,0) → (1,1) → (1,2) — 280 ms steps with 120 ms micro-holds, chips "shortfall" then "tie" — and exits the **bottom** edge onto the second plate: "`Failed`", with a refund chip arcing back (450 ms, `accord-settle`, curved path) to a filer glyph at origin. *Viewer: terminal two — exhausting draw attempts ends in `Failed` + refund, not a Ruling.*
8. **5.9–7.0 s.** Hold 400 ms (plates breathe), then all path residue, chips, and clusters crossfade out (400 ms `accord-exit`) leaving bare axes — identical to the core-loop start frame.

**Motion spec**

- Durations: steps 480 ms; chips 200 ms; slash marks 180 ms; cluster pops 280 ms; check/refund draws 280–450 ms.
- Easing: token steps `accord-hero` `(0.05,0.7,0.1,1)`; clusters/chips/badges `accord-move` `(0.2,0,0,1)`; refund arc `accord-settle` `(0.4,0,0.2,1)`; reset `accord-exit` `(0.3,0,1,1)`.
- Stagger: columns 80 ms; dots within cluster 40 ms (micro-cascade, total < 400 ms); ghost micro-holds 120 ms.
- Layers — **Primary:** the dispute token's stepped path. **Secondary:** cluster growth, slash marks, bond chips, size/attempt badges, terminal plates. **Ambient:** both terminal plates breathe at 1.5 % scale, 4 s sine, phases offset 2 s.
- Load-bearing principles: staging (grid before actors), anticipation (bond chip pays *before* the right-step is allowed), follow-through (cluster settles after token arrives), path-as-language (vertical vs horizontal steps carry the entire semantic), 1/3-distance rule honored (one cell per keyframed step).

**Loop & interaction model.** Intro draws axes once; core loop (beats 2–8) repeats with first/last frames matched (bare axes). Optional affordances: hover any cell → tooltip "`round_idx = r · draw_attempt = a` → panel N, bond 2^r×"; pointer-down + drag maps pointer X to core-loop progress (scrub), release resumes. Hover pauses ambient breathing only.

**Reduced-motion fallback.** Static composite: fully drawn grid, main path solid with arrowheads and step chips, ghost path dashed at 60 % opacity, both terminal plates labeled, token resting on "Ruling stands", refund chip mid-arc with a static arrow.

**Implementation notes.** SVG + GSAP timeline (`repeat: -1` on the core segment) — cell-precise stepped travel with exact holds and a scrub-able timeline is GSAP's home turf and keeps strokes crisp at docs DPI. Complexity **M**. Risks: 15-dot clusters illegible below ~420 px width — swap clusters for numeric badges ("3 / 7 / 15") under a container query; two chips per redraw trigger alternate across loop repeats so both causes are eventually shown.

---

## F2. The liveness escape hatch (`Failed` + `cancel_dispute`)

**Emotional target:** relief — every dead end has a priced exit; the viewer exhales because the worst case is a refund, never a captured Ruling.
**Motion personality:** Corporate with one Premium gesture — clockwork causality (timeout → exit) and a composed, receipt-like refund landing; no alarm, no red.

Scene: horizontal lifecycle spine, five station plates — Filed → Drawn → Committed → Revealed → Finalized. Above the spine, three cul-de-sac stubs (dead ends): after Filed (silent VRF oracle), at Revealed (ghosting jurors), at Finalize (absent cranker). Beneath the spine, a dashed teal refund rail collects every exit arrow into a `Failed` plate, which returns a refund to the Filer glyph at far left. Caption, persistent: *"the worst an attacker or a dead dependency can do is force a refund, not capture a ruling."*

**Storyboard** (core loop 7.1 s; intro 0.9 s once)

1. **0.0–0.9 s (intro, once).** Stations fade-rise in reading order (90 ms stagger, 280 ms each); refund rail stroke-draws; `Failed` plate and Filer glyph fade in; caption fades up by 0.6 s and persists.
2. **0.0–2.0 s — Scenario A, silent VRF oracle.** Token enters at Filed and slides one segment (400 ms `accord-move`); the VRF beacon glyph above the next hop dims to 40 % and stops pulsing (dead, 240 ms); the cul-de-sac's countdown ring drains full→empty over 900 ms **linear** (time drains at constant rate); at exactly 0, the exit arrow stroke-draws down to the rail (280 ms); token transfers to the rail, slides right-to-left along it (480 ms), passes `Failed`, and a "+ refund" receipt chip lands at the Filer (320 ms `accord-settle`). *Viewer: the oracle's silence is bounded by a clock, and the clock's expiry is the key to the exit.*
3. **2.0–2.3 s.** Reset crossfade: stall residue (dead beacon, ring, chips) fades 240 ms `accord-exit`; token re-materializes at Filed. Spine stays drawn.
4. **2.3–4.3 s — Scenario B, ghosting jurors.** Token advances to Revealed; three juror dots fade to 20 % with "no reveal" slashes; a "reveal shortfall" chip appears; clock drains 900 ms; exit → rail → `Failed` → refund lands. *Viewer: ghosting has the same priced exit.*
5. **4.3–4.6 s.** Reset crossfade (240 ms).
6. **4.6–6.5 s — Scenario C, absent cranker.** Token reaches Finalize; the crank glyph stays gray and idle (nobody turns it); clock drains 900 ms; exit → rail → `Failed` → refund. *Viewer: even the protocol's own maintenance being absent only forces a refund.*
7. **6.5–7.1 s.** All three cul-de-sacs breathe once simultaneously (2 % scale, 400 ms, shared event — "all exits verified"), hold 200 ms; residue fades to the clean-spine frame ≡ core-loop start.

**Motion spec**

- Durations: token segment 400 ms; clock drain 900 ms linear; exit arrow 280 ms; rail slide 480 ms; receipt 320 ms; resets 240 ms.
- Easing: travel `accord-move`; arrow draws and receipts `accord-settle`; residue fades `accord-exit`; clock linear (scanner semantics — the one sanctioned linear use).
- Stagger: stations 90 ms (total 450 ms, inside the < 500 ms budget); juror-dot fades 60 ms apart.
- Layers — **Primary:** token trajectory, stall, and exit. **Secondary:** dead-glyph states, countdown rings, slash chips, refund receipts. **Ambient:** the active station plate idles at a 3 s, 1 % sine pulse; inactive stations stay still (1/3-elements rule).
- Load-bearing principles: anticipation and enforced causality (the exit arrow cannot draw until the ring hits zero — the timeout gate is *shown*, not stated), follow-through (receipt lands after token arrives), staging (one scenario owns the frame at a time; the other cul-de-sacs sit dimmed at 60 %).

**Loop & interaction model.** Intro draws the spine once; core loop cycles the three scenarios, ending on the clean-spine frame identical to its start. Hover on any cul-de-sac → that scenario replays immediately (timeline seek) and a tooltip names the stall class and its timeout; hover anywhere pauses ambient only. Optional scrub bar under the frame maps to core-loop progress.

**Reduced-motion fallback.** Static composite: spine with all three cul-de-sacs visible simultaneously, each with a drained (zero) clock and a drawn teal exit arrow into the rail → `Failed` → Filer with "+ refund" chips; caption set in full.

**Implementation notes.** SVG + GSAP — three timelined scenarios sharing one reset function, plus stroke-draw arrows; programmatic reset logic (seek/restart) is awkward in hand-authored Lottie. Complexity **M**. Risks: three scenarios can crowd a small frame — park cul-de-sacs in fixed slots above the spine and keep each scenario's chips ≤ 2; do not animate the caption (it must be readable as static text too).

---

## F3. Pause scope split (an operational switch can never pick winners)

**Emotional target:** confidence — the switch is small on purpose; intake can be gated, adjudication structurally cannot, and the feared attack has no interface to grab.
**Motion personality:** Corporate industrial — valve mechanics with 2 px anticipation lifts, decisive 280 ms state changes, and a continuously-running conveyor whose uninterrupted motion *is* the argument.

Scene: left, two intake pipes labeled `create_dispute` and `stake`, each with a shutoff valve; right, one wide ungated channel with five stations — `appeal · commit · reveal · finalize · unstake` — carrying a constant ambient token flow. Center-left, a PAUSE switch plate. Vignette slot (upper right) reserved for the rejected attack.

**Storyboard** (core loop 6.2 s; intro 0.8 s once)

1. **0.0–0.8 s (intro, once).** Pipes and channel stroke-draw; station labels fade-rise (80 ms stagger); conveyor tokens are already mid-flow (ambient, continuous).
2. **0.0–0.8 s.** PAUSE switch plate rises (400 ms `accord-hero`). *Viewer: an operational control exists — and it is one small plate.*
3. **0.8–1.8 s.** Lever toggles (200 ms rotate 40° + 120 ms settle); both valves close: each wheel lifts 2 px (anticipation, 80 ms) then rotates 90° (280 ms `accord-move`); in-flight intake tokens halt at the valves and fade with small "gated" chips (200 ms `accord-exit`). *Viewer: pause gates exactly the two intake instructions.*
4. **1.8–3.4 s.** The ungated channel brightens 0.9→1.0 over 600 ms; a bracket stroke-draws over the five stations with the label "structurally un-gateable" (400 ms); commit/reveal/finalize/unstake tokens keep sliding through, untouched. Counter-motion: as the bracket draws left→right, the conveyor's newest token exits right at the same moment — cause and non-effect in one glance. *Viewer: adjudication cannot be paused, by structure.*
5. **3.4–4.8 s.** Attack vignette (ghost styling, 60 % opacity, muted crimson): a dashed note "pause during appeal window → smother appeals → forced finality" appears (240 ms); a ghost hand lunges to throw the switch at the `appeal` station and reaches for a valve mount that **is not there** — the appeal pipe is drawn seamless; the hand slips off (160 ms ease-in-out, 6 px), and a firm X stroke-draws over the note (240 ms); the note crumples (scale 1→0.92, opacity → 0.25, 280 ms). *Viewer: the attack has no interface — there is no valve to close.*
6. **4.8–5.6 s.** Resume: lever toggles back (200 ms + settle), valves reopen (280 ms), first intake token passes through (480 ms travel). *Viewer: pause is reversible intake control, nothing more.*
7. **5.6–6.2 s.** Hold 400 ms at the resumed-flow frame — identical to the core-loop start frame.

**Motion spec**

- Durations: valves 280 ms (+80 ms anticipation lift); lever 200 ms + 120 ms settle; token traversals 600 ms ambient; bracket 400 ms; X 240 ms; crumple 280 ms.
- Easing: valves/lever `accord-move`; bracket and X stroke-draws `accord-settle`; gated-token fades and crumple `accord-exit`; hand-slip ease-in-out; conveyor sine.
- Stagger: stations 80 ms; the two valves close as a shared motion event (start within 50 ms, land together).
- Layers — **Primary:** valve/lever state changes and the attack rejection. **Secondary:** gated-token rejections, bracket, labels, crumpled note. **Ambient:** the conveyor — a ≤ 12-token loop, transform-only, that never stops, even mid-pause (motion-as-message: the ambient layer carries the thesis).
- Load-bearing principles: anticipation (2 px wheel lift), staging (the attack vignette dims the rest of the scene 20 % while it plays), follow-through (hand slips and the note crumples), restraint — the X is firm and brief, never a shake.

**Loop & interaction model.** Intro draws once; core loop ends resumed ≡ started. Hover on either valve → tooltip "gated by pause: `create_dispute` / `stake`"; hover on any ungated station → tooltip "never gateable: adjudication". Hover on the switch previews the closed state at 25 % speed (scrub affordance) without committing the loop.

**Reduced-motion fallback.** Static composite: valves shown closed with two halted, chipped intake pipes; the ungated channel full of mid-flight tokens; bracket labeled "structurally un-gateable"; the attack note present with the X drawn over it and the seamless (valve-less) appeal pipe visible.

**Implementation notes.** SVG + GSAP — the pause/resume state machine and shared-motion valve sync want a timeline; valve rotation and token loops are simple transforms, so a CSS-only fallback is feasible if GSAP is unavailable. Complexity **M**. Risks: two narrative moments (pause + attack) in one loop — keep the vignette monochrome ghost styling so it reads as hypothetical, and keep total text ≤ 8 words per chip.

---

## F4. The attestation gate + `prune_juror`

**Emotional target:** rigor as care — three timestamps guard the pool, and even eviction is a withdrawal, not a punishment.
**Motion personality:** Corporate checkpoint precision (scans, stamps, cranks) with one Premium arc — the funds' curved flight to `pending_withdrawal`.

Scene: a horizontal juror-pool lane with three defense stations left→right — entry gate (at `stake`), freshness stamp (at `draw_seat`), eviction crank (`prune_juror`) — and, above right, an inset accumulator tree (root + 7 leaves). The tracked juror owns one highlighted leaf.

**Storyboard** (core loop 6.6 s; intro 0.9 s once)

1. **0.0–0.9 s (intro, once).** Stations stroke-draw and fade-rise (90 ms stagger); tree inset draws root-first then leaves (40 ms stagger); a horizon ruler fades in above the gate.
2. **0.0–1.5 s — Layer 1, entry gate.** A juror chip approaches carrying its SAS attestation card `(juror_credential, juror_schema)`; a scan-line sweeps the card (300 ms linear); the horizon ruler draws from "now" to "worst-case dispute horizon", and the card's expiry tick lands beyond the horizon — a ✓ pops (160 ms); the turnstile rotates 120° (360 ms `accord-move`) and the chip enters the pool; its tree leaf fills with stake weight and the root sum counts up "+N" (280 ms). *Viewer: at `stake`, expiry must outlive the worst-case dispute horizon.*
3. **1.5–2.7 s — Layer 2, draw-time freshness.** A VRF sparkle passes over the pool and selects the chip (400 ms); the freshness stamp descends 20 px and presses (280 ms, 3 % squash on contact, `accord-move`) leaving a dated stamp; chip proceeds to a drawn seat. *Viewer: `draw_seat` re-checks attestation freshness — the stake-time check is not trusted forever.*
4. **2.7–4.5 s — Layer 3, eviction.** The horizon ruler slides so "now" advances past the card's expiry tick; the card tints amber (240 ms); any-hand glyphs (permissionless — three small distinct hands, not one authority) turn the crank 90° (300 ms); the chip is escorted out of the pool (400 ms); its leaf drains to hollow (400 ms) with a "0" badge, the root sum counts down "−N"; funds arc leaf→`pending_withdrawal` tray (450 ms `accord-settle`, curved path). *Viewer: expired jurors are evicted by anyone, the leaf zeroes, and funds exit as a pending withdrawal — mirroring `request_withdraw`, not a slash.*
5. **4.5–5.7 s.** Pool settles; the tray's chip stacks; a fresh queued chip shuffles at the gate (loop hook); the hollow leaf crossfades to a fresh highlighted leaf (400 ms) — the tree is live.
6. **5.7–6.6 s.** Hold 300 ms; scene residue fades except stations + tree (400 ms `accord-exit`) ≡ core-loop start with the queued chip at the gate.

**Motion spec**

- Durations: scan 300 ms linear; turnstile 360 ms; stamp 280 ms (+3 % squash); crank 300 ms; leaf drain 400 ms; funds arc 450 ms; counter ticks 280 ms.
- Easing: mechanisms `accord-move`; stamp press with squash at 3 % (Corporate ceiling); funds arc and tray landing `accord-settle`; resets `accord-exit`; scan linear.
- Stagger: stations 90 ms; leaves 40 ms; any-hands 80 ms apart.
- Layers — **Primary:** the juror chip's full journey gate → pool → seat → eviction. **Secondary:** card scans, horizon ruler, stamp, crank, leaf zeroing, root-sum counters. **Ambient:** the tree breathes at 1 % scale (3.5 s sine); the queue shuffles ±2 px (4 s, phase-offset).
- Load-bearing principles: anticipation and shown causality (expiry must cross "now" before any hand can crank), follow-through (the withdrawal lands only after the leaf zeroes), arcs as language (funds leave on a curved, friendly path — contrast with the straight slash paths in F1), secondary action (sum counters narrate the tree staying consistent).

**Loop & interaction model.** Intro draws once; core loop ends with a queued chip at the gate ≡ start. Hover each station → tooltip: "1 · checked at `stake` — expiry > worst-case dispute horizon" / "2 · re-checked at `draw_seat`" / "3 · `prune_juror` — permissionless, mirrors `request_withdraw`". Hovering the tree highlights the tracked leaf's proof path root↔leaf.

**Reduced-motion fallback.** Static triptych: three stations with the chip frozen mid-action at each — (1) card beside the horizon ruler with expiry tick beyond horizon, ✓ drawn; (2) stamp pressed with fresh date; (3) hollow "0" leaf, funds mid-arc into `pending_withdrawal`, crank turned by the any-hands.

**Implementation notes.** SVG + GSAP — the leaf-zero/root-sum sync and the funds arc need timeline precision, and the tree inset must stay consistent with the lane. Complexity **L** (most layered scene in the group). Risks: density — cap the tree at 7 abstract leaves, no labels inside the inset; if the frame must go < 420 px, drop the horizon ruler to a single tick pair.

---

## F5. Scalar voting (median + coherence band)

**Emotional target:** fairness made visible — coherence is a band around the median, not a knife-edge; a juror can be slightly wrong and still paid, and the viewer sees exactly where the line is.
**Motion personality:** Corporate clarity — orderly bar rises and dot drops, a measured scan classifying dots, one controlled emphasis moment on the boundary dot.

Scene: two panels divided by a hairline. Left: "Plurality — exact match" bar chart. Right: "Median — within band" number line. Formula chip, persistent under the right panel: `|vote − final_ruling|·10⁴ ≤ final_ruling·tol_bps` (default ±1 %).

**Storyboard** (core loop 6.4 s; intro 0.7 s once)

1. **0.0–0.7 s (intro, once).** Divider draws; both panel titles rise 16 px + fade (120 ms apart); formula chip fades in.
2. **0.0–1.5 s — left panel.** Seven bars rise (300 ms `accord-move`, 50 ms stagger — sequential reading order); the Ruling bar takes a gavel tick; bars whose height ≠ Ruling desaturate and receive slash marks (200 ms); only exact-height bars keep teal "paid" chips. *Viewer: plurality coherence is binary exact-match — near misses are slashed.*
3. **1.5–3.6 s — right panel.** The number line draws; nine vote dots drop onto it (320 ms, 60 ms stagger, 3 % settle); the median dot is flagged — a ring pulses once around it (500 ms `accord-settle`) with a "median = final tally" label; the tolerance band shades outward from the median: two wing rectangles grow to the ±1 % ticks (400 ms each direction, `accord-settle`), ticks labeled "±1 % (tol_bps)". *Viewer: `Median` disputes file with zero options; jurors reveal u64 fixed-point values; the tally is the median; coherence is a band, not a point.*
4. **3.6–4.6 s — classification scan.** A highlight sweep passes left→right across the number line (500 ms linear, scanner semantics): dots inside the band tint teal with fee chips (180 ms, right behind the sweep); dots outside tint muted crimson with slashes. One dot sits *just* outside the boundary — it scales to 1.15 for 300 ms with a micro-label "just outside" (the emphasis beat). *Viewer: the boundary is strict but generous — and exactly located.*
5. **4.6–5.6 s — contrast pass.** A thin connector draws from the left panel's tallest *slashed near-miss* bar to the right panel's *paid* near-miss dot (450 ms, dashed) with a chip: "same distance from the result — different outcome". *Viewer: the Plurality/Median contrast lands in one line.*
6. **5.6–6.4 s.** Hold 300 ms; band unshades and dots fade to neutral (400 ms `accord-exit`), bars lower (300 ms) — both panels empty ≡ core-loop start (titles + formula persist).

**Motion spec**

- Durations: bars 300 ms; dots 320 ms; median ring 500 ms; band wings 400 ms; sweep 500 ms; classifications 180 ms; connector 450 ms.
- Easing: bars/dots `accord-move` with 3 % settle; band wings and median ring `accord-settle`; sweep linear; un-classification and bar exits `accord-exit`.
- Stagger: bars 50 ms (350 ms total); dots 60 ms (540 ms visual spread, but waves land within the 500 ms budget since drops overlap); classification rides the sweep (shared-motion rule: each dot reacts within 50 ms of the sweep crossing it).
- Layers — **Primary:** band shading + classification scan. **Secondary:** dot drops, median flag, slashes, fee chips, connector. **Ambient:** the band's opacity breathes 0.85→1.0 (4 s sine) — **never its width** (±1 % is a semantic invariant and must not wobble); median ring idles at 1 %.
- Load-bearing principles: staging (left panel fully resolves before the right begins), anticipation (dots land before the band shades), emphasis via restraint (one dot scales, everything else holds), wave stagger for the bar rise.

**Loop & interaction model.** Intro draws titles once; core loop ends on empty panels ≡ start. Hover a dot → tooltip with its raw value and `|vote − final_ruling|` in bps vs the bound; drag the band edges → they resist (2 px elastic pull, snap back 200 ms): the tolerance is fixed by CaseTerms, not negotiable — a micro-interaction that teaches F6. Scrub bar optional.

**Reduced-motion fallback.** Static both panels fully resolved: plurality bars with exact-match slashes and paid chips; median dots placed, median flagged, band shaded to ±1 % ticks, teal/crimson classification complete, boundary dot labeled, connector + formula chip visible.

**Implementation notes.** SVG + GSAP — the sort-settle on dot drops and the outward band growth want keyframe precision; GSAP also powers the drag-resist affordance. Complexity **M**. Risks: dual-panel density — minimum comfortable inline width ~480 px; below that, stack the panels vertically in the same SVG viewBox and slow the stagger to 70 ms.

---

## F6. CaseTerms freeze (config snapshot at filing)

**Emotional target:** permanence — the rules of your dispute were photographed at filing and cannot move under you; the recurring "can governance change my dispute mid-flight?" question dies on sight.
**Motion personality:** Premium ceremonial on a Corporate chassis — the camera-flash snapshot and the staple are the loop's one elegant gesture; everything else is steady, welded, immovable.

Scene: left, a Subaccord control panel with compact dials for `windows · aggregation · appeal_window · reveal_threshold_bps · coherence_tol_bps · ladder`, a 48 h authority-timelock badge, and a welded sub-plate below labeled "identity set — immutable" (rivets + weld seams). Right, a Dispute card, initially empty.

**Storyboard** (core loop 6.6 s; intro 0.9 s once)

1. **0.0–0.9 s (intro, once).** Panel frame draws; six dials fade in (70 ms stagger, 280 ms each — total 420 ms); timelock badge and welded sub-plate rise last; Dispute card fades in empty.
2. **0.0–1.4 s — filing & snapshot.** A `create_dispute` token slides in from an Arbitrable glyph (400 ms); the camera flash fires — white overlay 0→0.35→0 in 120 ms; a snapshot card ejects and flies a 40 %-width arc to the Dispute card (450 ms `accord-hero`, scale 1.06 at the arc apex — the 1/3-distance rule's intermediate keyframe) and staples on: two staple marks pop (160 ms, 5 % — mechanical punctuation, the family's overshoot ceiling breached deliberately and only here). The Dispute card now carries frozen mini-dials. *Viewer: all mechanism parameters are copied onto the Dispute at `create_dispute`.*
3. **1.4–3.0 s — divergence.** A governance hand turns the live `appeal_window` dial: 4° anticipation, then 60° rotation (360 ms `accord-move`); the timelock badge's ring rotates and a "queued · 48 h" chip appears (240 ms); three future-filing cards land below the live panel (80 ms stagger, 320 ms each); the frozen copy on the Dispute card does not move — a lock ring pulses once around it (400 ms `accord-settle`). A thin propagation arrow tries to run from the live dial to the Dispute card and stops dead at the snapshot boundary — small X (200 ms). *Viewer: the 48 h authority timelock governs only future filings; a mid-flight dispute is untouched.*
4. **3.0–4.2 s — immutability test.** A second hand puts a wrench to the welded sub-plate's dial: it rotates 8°, springs back (240 ms, two ease-in-out oscillations — firm, not playful), the wrench slips off; the weld seam glints once (a 300 ms specular sweep). *Viewer: the identity set is immutable outright — there is nothing to turn.*
5. **4.2–5.4 s — resolution.** The Dispute card, still carrying its snapshot, receives a Ruling stamp (280 ms, `accord-settle`); the frozen dials remain visibly identical to their photographed values. Caption fades beneath: "your dispute's rules were fixed at filing."
6. **5.4–6.6 s.** Hold 300 ms; Ruling stamp, queue cards, chips, and the stapled snapshot crossfade out (400 ms `accord-exit`); the live dial rotates back during the crossfade; panels pristine ≡ core-loop start.

**Motion spec**

- Durations: flash 120 ms; snapshot flight 450 ms; staples 160 ms; dial turn 360 ms (+80 ms anticipation); timelock ring 240 ms; queue cards 320 ms; wrench slip 240 ms; stamp 280 ms.
- Easing: flight `accord-hero`; dial/queue `accord-move`; stamp, lock-ring pulse, glint `accord-settle`; wrench ease-in-out (error-slip family: firm, 2 oscillations, no bounce curve); resets `accord-exit`.
- Stagger: dials 70 ms; queue cards 80 ms; staples as a shared event (≤ 50 ms apart).
- Layers — **Primary:** the snapshot flight + staple (the ceremony). **Secondary:** dial turns, timelock ring, queue cards, wrench slip, blocked arrow + X, Ruling stamp. **Ambient:** a single LED on the panel breathes (4 s, 1 %); a slow sheen sweeps the stapled snapshot once post-staple (2 s, premium accent, opacity ≤ 0.15).
- Load-bearing principles: staging (the flash owns the frame — everything else dims 15 % for 200 ms), anticipation (dial pre-rotation; timelock ring spins before the queue appears), follow-through (queue lands after the dial settles), secondary action (the wrench slip teaches immutability without a paragraph).

**Loop & interaction model.** Intro draws once; core loop ends pristine ≡ start. Hover a live dial → tooltip "live parameter — timelocked 48 h, affects future filings only"; hover the stapled snapshot → tooltip "CaseTerms — frozen at `create_dispute`"; hover the welded sub-plate → "identity set — immutable". Optional: click the snapshot to detach a magnified overlay of the frozen values.

**Reduced-motion fallback.** Static split-frame: left the live panel with one dial mid-turn, 48 h timelock badge, and the queue of three future filings; right the Dispute card with the stapled snapshot, lock ring drawn, Ruling stamp; the welded sub-plate with the slipped wrench; caption set.

**Implementation notes.** GSAP + SVG for the timeline; the flash/arc/staple moment is equally Lottie-friendly if a designer authors it, but GSAP keeps the intro/core split and hover tooltips in one system. Complexity **M**. Risks: six labeled dials clutter — render compact icon-dials with labels on hover only; keep the flash ≤ 0.35 opacity so it never reads as an alarm strobe.

---

## F7. Trust profile map

**Emotional target:** candor — the protocol points directly at its own trust boundaries; honesty rendered as a feature diagram, the viewer trusts the map because nothing is hidden.
**Motion personality:** Premium breathing with Corporate annotation — slow sine zones, desaturated boundaries, precise little verification chips; the one red assumption stated plainly and contained.

Scene: a schematic system map in three color-coded territories. Green (left), "trustless by construction": accumulator root, sortition verification, fee accounting. Amber (right-upper), "trusted — attributed & mitigated": VRF provider liveness, evidence operator plaintext access, credential authority judgment, multisig upgrade authority pre-freeze. Red (right-lower core), "honest-majority assumption", wrapped in a containment ring. Legend chips along the bottom.

**Storyboard** (core loop 6.7 s; intro 0.8 s once)

1. **0.0–0.8 s (intro, once).** Territory boundaries stroke-draw; nodes fade in (80 ms stagger); legend chips rise: green "verified on-chain", amber "trusted · attributed", red "honest-majority assumption".
2. **0.0–2.2 s — green focus.** A vertical scan band sweeps the green territory (900 ms linear); each node's ✓ re-draws (240 ms stroke, 120 ms stagger); "verified on-chain" chips pulse once. *Viewer: the accumulator root, sortition verification, and fee accounting are checked by anyone, every time — no trust required.*
3. **2.2–4.0 s — amber focus.** Four amber nodes brighten sequentially (140 ms stagger); each flips a mitigation tag (rotateX flip, 260 ms `accord-move`): "VRF liveness → timeout-gated exit", "evidence operator → plaintext access, attributed", "credential authority → judgment; attestations expire", "upgrade authority → timelocked · pre-freeze". The amber border pulses once. *Viewer: residual assumptions are explicit, and each carries its mitigation — several link straight back to F2 and F4.*
4. **4.0–5.9 s — red focus.** The red core breathes 0.97→1.03 (continuing 3.5 s sine); a stake-weight bar fills to just past 51 % with the label "assumes honest stake majority"; a coherence beam: a majority of juror dots align into a Ruling glyph while one lone incoherent dot takes a slash; the containment ring pulses (500 ms border glow). *Viewer: exactly one deep assumption, stated plainly, priced into the economics — and bounded.*
5. **5.9–6.7 s.** All zones return to resting luminance (500 ms `accord-settle`), the legend breathes once in sequence (green→amber→red, 120 ms apart — a 3-chip micro-cascade), hold 200 ms, crossfade 400 ms `accord-exit` to the neutral map ≡ core-loop start.

**Motion spec**

- Durations: scan 900 ms linear; ✓ re-draws 240 ms; tag flips 260 ms; bar fill 600 ms; ring pulse 500 ms; settle 500 ms.
- Easing: flips `accord-move`; bar fill `accord-settle`; pulses and settles `accord-settle`; breathing sine ease-in-out; scan linear.
- Stagger: nodes 80 ms; ✓ re-draws 120 ms; amber focus 140 ms; legend cascade 120 ms.
- Layers — **Primary:** the focus sweep and what it verifies/flips/reveals per zone. **Secondary:** mitigation tags, stake bar, coherence beam, containment pulse, legend. **Ambient:** the map always breathes — zone luminance sine cycles at offset phases (green 4 s, amber 5 s, red 3.5 s, amplitudes ≤ 15 % of the focus moves) so the heat-map is alive even between focuses; the red breath is the slowest-changing element on screen (calm containment, never alarm).
- Load-bearing principles: slow-in/slow-out (all breathing), staging (one zone owns the frame per phase; others dim to 80 %), secondary action (mitigation flips), restraint — crimson is desaturated, its pulse ≤ 0.2 Hz, and color is never the only signal (every zone carries icon + label).

**Loop & interaction model.** Intro draws once; core loop ends on the neutral map ≡ start. Hover a zone → that zone's focus phase seeks and holds (pause-on-hover), with the legend chip for that zone highlighting; hover an amber node → its mitigation tag flips and stays; a small zone toggle (green/amber/red) in the corner jumps the loop to that focus. Optional scrub across the bottom.

**Reduced-motion fallback.** Static heat-map: all zones color-coded with icons and labels, ✓ marks drawn on green nodes, all four amber mitigation tags visible (stacked), stake bar filled past 51 % with the honest-majority label, containment ring drawn, legend complete.

**Implementation notes.** SVG + CSS (GSAP optional) — the identity is dominated by CSS-keyframe breathing and a linear sweep; flips are CSS 3D transforms, so this is the one concept that ships dependency-free if the docs site wants zero runtime. Complexity **M**. Risks: red-zone connotation — keep crimson desaturated, breathing ≤ 0.2 Hz, and always paired with the text label; eight named nodes + legend is the density ceiling — do not add more nodes to this frame.

---

## Family build order (for the motion designer)

1. **F1** and **F5** first — they establish the grid/number-line visual grammar and the classification scan reused by F4/F7.
2. **F2** next — its spine, countdown ring, and refund arc are imported by F4 (eviction) and F7 (VRF-liveness tag).
3. **F3**, **F6** — the two mechanism scenes; both reuse the chip/badge kit from steps 1–2.
4. **F4** last — it composes the gate, stamp, tree, and withdrawal arc patterns from everything above; build it from the kit, not from scratch.

All seven share the preamble's easing tokens, duration palette, intro-once/core-loop model, color-motion semantics, and reduced-motion rule, so the group reads as one family and can merge with groups A–E under the same Brand Motion Identity.
