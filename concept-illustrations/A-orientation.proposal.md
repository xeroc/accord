# Group A — Orientation · Motion Illustration Proposals

Source brief: `concept-illustrations/A-orientation.md`. Status: **proposal** — storyboards and specs only, no implementation. Each concept is one silent, self-contained looping illustration (~3–8 s loop) viewable inline on a docs page. Group A is the *first screen* a reader meets: staging weight and first-impression clarity are prioritized over density. Every diagram stays legible as a static image first; motion only makes the relationships impossible to misread.

---

## Group A preamble — Brand Motion Identity: "Measured Certainty"

**Derivation.** Accord is a security-adjacent arbitration primitive; its docs audience is smart, skeptical, and allergic to hype. Trust here reads as *calm precision*, never energy or delight. The family therefore runs a **Corporate core with Premium pacing**: Corporate's predictability and 0 %-overshoot discipline for all interaction-tier motion, Premium's slower 350–600 ms settles and minimal property count for the illustration tier (the 90/10 archetype-mixing rule). Nothing bounces; weight is expressed through slower easing and longer settles, never through overshoot.

### The three constants

| Constant | Value | Notes |
|---|---|---|
| **Signature easing** (80 % of moves) | `cubic-bezier(0.4, 0, 0.2, 1)` (`--ease-accord`, Premium standard) | All illustrative entrances, travels, settles. 0 % overshoot. |
| **Duration palette** — illustration tier | quick **350 ms** / standard **500 ms** / slow **800 ms** | Slower than UI tier on purpose: these are read, not clicked. |
| **Duration palette** — interaction tier (hover/scrub) | quick **150 ms** / standard **250 ms** / slow **400 ms** | Corporate tier; `cubic-bezier(0.2, 0, 0, 1)` (`--ease-snap`). |
| **Entrance pattern** ("settle-rise") | opacity 0→1 + translateY 8–12 px→0 + scale 0.98→1, `--ease-accord`, 0 % overshoot | One entry style everywhere; exits use `cubic-bezier(0.3, 0, 1, 1)` and are 30–50 % shorter than entrances. |

### Family laws (apply to every Accord illustration, all groups)

1. **Zero-overshoot law.** No bounce, no ease-out-back, no squash/stretch. Slashing, rulings, and stakes are firm events; the motion must feel notarized, not playful.
2. **Three-layer law.** Every illustration carries a primary action, a secondary reaction (labels landing 100 ms after parents, node flashes when particles arrive, in-chip consequences), and an ambient layer (sine-based breathing/floating on desynchronized 3000/4000/5500 ms cycles; ≤ 20 % of primary energy, ≤ 6 ambient elements).
3. **One-hero-at-a-time law (1/3 rule).** Max ⅓ of elements in active motion at once; no unbroken travel > ⅓ of the canvas — long edges get a mid-edge waypoint (see chain-crossing checkpoint below). Coordinated cascades use 50–80 ms stagger, onset span ≤ 400 ms.
4. **Rest-beat law.** Every loop ends with ≥ 600 ms of synchronized quiet whose frame is pixel-identical to the loop's first frame, so `repeat` restarts are imperceptible.
5. **Accent discipline.** Exactly one accent color per illustration marks "the thing this diagram is about." Everything else is monochrome/theme-neutral. The accent may move between heroes across beats but never appears on two elements at once.
6. **Pausable law.** Loops > 5 s pause when offscreen (IntersectionObserver) and honor any global docs "pause animations" control.

### Shared visual grammar (so groups A–F merge into one family)

- **Chain boundary:** on-chain = solid strokes; off-chain = 2 px dashed strokes. Anything crossing the boundary animates through a **checkpoint** — a 120 ms pause + accent flash at the crossing point (this is also the 1/3-rule waypoint).
- **Value flow:** particles/chips travel edges with ease-in-out (depart gentle, land gentle — reads request→response). Never linear for spatial travel; linear is reserved for dash-march and progress.
- **Entities:** people/programs are rounded chips; owned state is small inner chips; the hero container of a beat takes the accent.
- **Text:** SVG `<text>` (selectable, themeable), never outlined glyphs. Labels land 100 ms after their parent via fade-only.
- **Theme:** all colors via CSS custom properties so light/dark docs themes both work; the A3 black box uses a theme-aware elevated-surface token, not raw `#000`.

### Loop convention

Build-once, then loop: the first ~2–3 s is a staged **build** (plays once, on scroll-into-view), followed by a seamless **5–6 s life loop** that starts and ends on the fully-built resting frame. Total file footprint per illustration: ≤ 20 simultaneously-animated elements; transform + opacity only.

### Reduced-motion convention (family-wide)

`prefers-reduced-motion` swaps to a **fully-resolved static keyframe**: every label visible, every flow expressed as static arrowed edges, all story beats represented simultaneously. Swap via a 200 ms crossfade on view. Motion is never the sole carrier of information.

---

## A1. System map — the cast of characters

*The entity graph every later illustration gets embedded into. Hero of this diagram: the expanded Subaccord.*

### Emotional target & motion personality

**Emotional target:** calm command — "this system is legible; here is the whole territory and your place in it" (Three Pillars: Emotional = calm confidence · Narrative = the map assembles from the chain outward, each owner clearly owning · Craft = precise containment, measured cascades). **Motion personality:** Corporate core with Premium settles — the most ceremonious diagram in the family because it is the first (duration tier: illustration; overshoot: 0 %).

### Storyboard

**Canvas:** 16:9 inline SVG (min rendered width 640 px; labels ≥ 12 px at that width). Layout: large rounded chain-boundary rect ("Solana · on-chain", solid stroke) fills center-left; inside it the **Accord program** container holds **Subaccord A** (expanded) and a collapsed stack "Subaccord B / C / ⋮ many, permissionless" (dimmed to 60 %). Below the Accord box hangs the Dispute cluster (Dispute → Round → AppealBond). Off-chain peers sit above the boundary outside it: evidence daemon, VRF oracle, cranker, credential authority, each with a dashed connector to its touchpoint (evidence daemon→evidence operator pubkey, VRF oracle→accumulator root, cranker→Rounds, credential authority→Juror cluster). Juror tokens (3) sit bottom-left outside the boundary; a single generic "Arbitrables (any program)" chip sits right, inside the boundary.

**Build (plays once, 0.0–3.2 s):**

1. **0.0–0.7 — the chain boundary draws.** Perimeter stroke draws left→right (stroke-dashoffset, 700 ms, `--ease-accord`); boundary label fades at 0.5. *Viewer now understands: everything inside this line lives on-chain.*
2. **0.5–1.1 — the Accord program settles in.** Container enters via settle-rise (500 ms). *One program, the stage's centerpiece.*
3. **0.9–1.9 — Subaccord A expands (HERO).** Box settles (0.9–1.4), then its five internals cascade at 60 ms stagger, onset span 240 ms: vault ① (1.20), vault ② (1.26), accumulator root (1.32), evidence operator pubkey (1.38), authority (1.44), each a 400 ms fade+settle-rise of 6 px. *A Subaccord owns exactly these five things.*
4. **1.7–2.3 — the collapsed stack.** Subaccord B, C, and a "⋮" chip enter at 80 ms stagger, dimmed to 60 % opacity, no internals. *There are many Subaccords; anyone may create one.*
5. **2.0–2.6 — off-chain peers arrive.** Four peer chips cascade at 50 ms stagger (onset span 150 ms); each dashed connector draws to its touchpoint (dash-offset draw, 400 ms each, staggered with its chip). *These four roles live outside the chain and reach in.*
6. **2.4–3.0 — actors and the dispute tree.** Three Juror tokens and the Arbitrable chip settle at their posts (stagger 70 ms); the Dispute → Round → AppealBond subtree drops in hanging below the Accord box (settle from −8 px, stagger 70 ms). *Disputes are born inside Accord; Rounds and AppealBonds hang off them.*
7. **3.0–3.2 — labels land.** All remaining labels fade in 100 ms behind their parents. Frame = **resting state R**.

**Life loop (5.0 s, repeats ∞ from 3.2 s; one flow active at a time — the 1/3 law):**

8. **3.2–4.1 — stake beat.** Juror ① emits a stake particle up its edge; 120 ms checkpoint flash at the chain boundary crossing; lands in vault ① (total travel 650 ms, ease-in-out). Vault ① flashes accent (scale 1→1.04→1, 300 ms); accumulator root emits one brief leaf-tick sparkle (secondary, 250 ms). *Jurors stake in; the accumulator is live.*
9. **4.1–5.0 — dispute beat.** The Arbitrable chip emits a Dispute packet along its edge into the Dispute node (700 ms ease-in-out); Dispute node lights with the accent; a Round ring draws around it (400 ms). *Any Arbitrable files a Dispute via CPI.*
10. **5.0–5.9 — randomness beat.** The VRF oracle's dashed connector pulses; a randomness glyph travels it to the accumulator root (650 ms, checkpoint at boundary); the three Juror tokens highlight in a 70 ms cascade (drawn-panel preview). *VRF randomness selects stake-weighted Jurors.*
11. **5.9–6.8 — crank beat.** The cranker's connector pulses; the Round ring advances one notch (rotate 30°, 350 ms, ease-in-out); the AppealBond chip shimmers once (foreshadow of group D). *Off-chain crankers advance Rounds.*
12. **6.8–8.2 — rest.** Flow overlays fade out (250 ms, `--ease-exit`); only ambient remains; frame returns exactly to **R**. Loop restarts seamlessly.

### Motion spec

- **Durations:** entrances 400–500 ms (illustration standard); particle travels 650–700 ms scaled to distance (~200 px ≈ 1.3× base); node flashes 300 ms; label fades 200 ms; rest beat 1.4 s.
- **Easing:** all spatial motion `cubic-bezier(0.4, 0, 0.2, 1)`; particles ease-in-out per hop; fade-outs `cubic-bezier(0.3, 0, 1, 1)`; dash-march and ring rotation linear-adjacent only where they read as progress (ring notch uses ease-in-out).
- **Stagger:** internals 60 ms (span 240 ms), peers 50 ms (span 150 ms), collapsed stack 80 ms (span 160 ms) — all cascades within the 400 ms onset budget.
- **Three layers:** *Primary* = staged build + the four sequential flow beats. *Secondary* = labels landing 100 ms after parents; accent flashes on arrival; leaf-tick sparkle; Round-ring draw. *Ambient* = boundary glow breathing (scale 0.995–1.005, 4000 ms sine), collapsed-stack float (±4 px, 5500 ms, offset 30 %), slow dash-march on active peer connectors (12 s cycle), Juror token idle bob (±3 px, 3000 ms) — ≤ 6 elements, ≤ 20 % of primary energy.
- **Load-bearing principles:** **Staging** (Subaccord A is the hero — enters full-strength while the stack and peers sit at 60 %); **Follow-through/overlapping action** (labels trail parents by 100 ms; flow beats chain reaction→flash); **Slow in/out** (every entrance decelerates into place); **1/3 rules** (one flow at a time; boundary checkpoint breaks the long juror/arbitrable edges); **Appeal** (uniform settle-rise, no abrupt stops).
- **Property budget:** position + opacity for entrances (two properties max per element); flashes add scale only.

### Loop & interaction model

Build plays once on scroll-into-view (IntersectionObserver, 25 % visibility threshold); the 5.0 s life loop then repeats forever and pauses offscreen. Loop seam: beat 12 ends on frame-identical resting state R — flow overlays are the only loop-phase mutators and they are fully faded by 8.05 s. **Hover:** hovering any container or connector highlights its neighborhood (element + direct edges to 100 %, everything else dims to 40 % over 150 ms, `--ease-snap`) with a term tooltip (e.g., hovering the accumulator root: "Merkle-Sum-Tree of Juror stakes — live"). Hovering the collapsed stack expands it one notch (one extra collapsed row peeks, 200 ms) to reinforce "many, permissionless." **Optional scrub:** none needed — beats are short. Export as a standalone SVG with `a1-`-prefixed ids/classes so groups B–F can embed it without selector collisions.

### Reduced-motion fallback

Fully-built static map at resting state R with every label visible and all four flows expressed as static arrowed edges: a stake arrow Juror ①→vault ①, a Dispute arrow Arbitrable→Dispute, a randomness glyph pinned mid-connector VRF oracle→accumulator root, a crank arrow cranker→Round. Arrowheads carry the meaning; no particles, no breathing. Presented via 200 ms crossfade on view.

### Implementation notes

**Vehicle:** inline SVG + CSS keyframes/WAAPI + ~30 lines of JS (IntersectionObserver for build trigger/offscreen pause; hover-neighborhood mapping). Justification: zero runtime dependencies for the most-embedded diagram in the family; SVG text stays selectable and theme-aware; crisp at any DPI. **Complexity: L** (~28 animated elements, but each is a simple fade/settle; the build is cascade-only and the loop is four sequential one-particle beats). **Risks:** (1) label density — enforce min 12 px type at 640 px width and drop secondary labels (e.g., "authority" internals keep icon+short label only); (2) element count vs. the 20-simultaneous budget — only cascades during build exceed it briefly and never more than ⅓ in motion; (3) mobile — below 480 px width, swap to the reduced-motion static (same asset, animations disabled) rather than squashing the layout.

---

## A2. The Schelling point = honesty

*The game-theoretic core: independent convergence on truth because coherence pays. Two panels, one caveat.*

### Emotional target & motion personality

**Emotional target:** quiet inevitability — "honesty is not a virtue claim here, it is simply where everyone lands" (Three Pillars: Emotional = calm conviction, never excitement · Narrative = independent minds arrive at one focal point, the payoff matrix confirms it, the whale reminds us it is conditional · Craft = synchronized breathing, a firm slash, a slow shadow). **Motion personality:** Premium throughout (350–600 ms, `cubic-bezier(0.4, 0, 0.2, 1)`, 0 % overshoot) — game theory earns gravitas, and the payoff strike must feel notarized, not cartoony.

### Storyboard

**Canvas:** wide two-panel SVG (~2:1), left panel "independent convergence" (≈ 55 % width), right panel "payoff matrix" (≈ 45 %). Left: three Juror chips arranged on an outer arc, three nested expectation arcs pointing inward to a central focal node labeled "the focal answer — honesty". Arc labels, outside-in: "you expect me to vote honestly" → "so you will vote honestly" → "so I vote honestly". Right: 2×2 matrix, rows *your vote: coherent / incoherent*, columns *majority: coherent / incoherent*; cells: (+ fee + slashed stake) · (**− stake slashed** ← the slash cell) · (− in minority, slashed) · (only under a dishonest majority). A blurred whale silhouette (dark rounded-fish shape with a fin, 20 % opacity) lurks off-canvas left.

**Build (plays once, 0.0–2.6 s):**

1. **0.0–0.6 — the cast.** Left-panel frame and three Juror chips settle-rise in an 80 ms cascade. *Three independent jurors, no communication channel drawn between them.*
2. **0.5–2.0 — expectation arcs draw, outside-in.** Arc 1 draws (0.5–1.1, 600 ms stroke draw), arc 2 (0.9–1.5), arc 3 (1.3–1.9); each arc's text label fades in as its arc completes. *The reasoning nests: I am honest because you will be, because you expect me to be…*
3. **1.9–2.4 — convergence.** The three arc tips meet; the focal node forms and pulses once (scale 1→1.06→1, 500 ms, `--ease-accord`, no overshoot) and takes the accent. *All expectations point at one answer.*
4. **2.2–2.6 — sync begins.** All three arcs start breathing in phase (opacity 0.75→1→0.75, 3000 ms sine). Frame = **resting state R**: converged, synchronized, matrix still dim-empty. *(In-phase breathing is the Schelling point made visible.)*

**Life loop (6.0 s, repeats ∞ from 2.6 s):**

5. **2.6–4.2 — the matrix answers why.** Axes and row/column labels settle (2.6–3.0); four cells cascade in at 80 ms stagger (3.0–3.4, onset span 240 ms); the "vote coherent" row sweeps with a gradient highlight left→right (3.5–4.1, 600 ms); the slash cell takes a firm strike — a single strike-through line draws across it in 250 ms, and two stake chips exit the cell arcing down-out (4.0–4.3, secondary). Caption fades in: "coherent strictly dominates" (4.1–4.4). *Given an honest majority, honesty is the only rational vote.*
6. **4.4–6.4 — the caveat: the whale.** Matrix and caption dim to 40 % (4.4–4.8). The whale shadow fades in at the left edge and traverses behind the left panel (fade-in over first 15 %, traverse, fade-out over last 15 %; scale 0.9→1→0.95 keyframes; 2000 ms total — keyframe changes satisfy the 1/3 travel rule). As it passes: the three arcs' breathing phases drift apart (desync 4.6–5.6), the focal node drifts 8 px off-center and dims to 60 % (4.8–5.6), one arc bows outward 10 px. Caveat caption fades in: "…conditional on an honest stake majority" (5.0–5.6). *The equilibrium holds only while the stake majority is honest; a whale distorts the focal point.*
7. **6.0–6.8 — restoration.** The whale exits; arcs re-phase into synchrony; the focal node re-centers and re-brightens (6.2–6.8, 600 ms). *Remove the distortion, convergence returns.*
8. **6.8–8.6 — rest.** Matrix un-dims (6.8–7.2); captions fade out by 7.4; synchronized breathing only. Frame returns exactly to **R**. Seamless restart.

### Motion spec

- **Durations:** arc draws 600 ms each (sequential story beats, 400 ms onset spacing); focal pulse 500 ms; cell cascade 300 ms each at 80 ms stagger; dominance sweep 600 ms; slash strike 250 ms (firm — two-frame draw then dead stop, error-shake discipline: no wobble); whale traverse 2000 ms; desync/resync drifts 1000 ms each.
- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` for all entrances, draws, sweeps; strike line uses `cubic-bezier(0.2, 0, 0, 1)` for a decisive stop; whale uses sine-in-out; breathing is sine-in-out by definition; all fades-out `cubic-bezier(0.3, 0, 1, 1)`.
- **Stagger:** cells 80 ms (span 240 ms ✓); Juror chips 80 ms; arc onsets 400 ms apart (intentional narrative sequencing, not a cascade).
- **Three layers:** *Primary* = arc draws → convergence pulse → dominance sweep + slash → whale distortion → restoration. *Secondary* = arc labels landing after draws; stake chips ejected from the slash cell; matrix dim/restore; captions 100 ms after their actions. *Ambient* = in-phase arc breathing (3000 ms sine) whose *synchronization itself is content* — the desync in beat 6 is the caveat rendered as motion; focal node idle glow (4000 ms).
- **Load-bearing principles:** **Timing** (serious mood — slow tier, the whale is a dramatic reveal at 2 s); **Staging** (one panel active: matrix dims while the whale owns the left panel; one primary action per beat); **Anticipation** (the whale's shadow leading edge enters ~200 ms before the arcs react); **Secondary action** (ejected stake chips, 30–50 % amplitude, delayed 100 ms); **Appeal** (smooth arcs everywhere — curved = friendly-inevitable; the only straight aggressive line in the whole piece is the slash).
- **Property budget:** arcs = stroke draw + opacity; whale = position + scale + blur (fixed filter, animated transform only); drift = position only.

### Loop & interaction model

Build once on view, then the 6.0 s loop repeats ∞ (pauses offscreen). Seam: beats 7–8 return arcs to phase-zero, focal to center, matrix to full — frame-identical to R; breathing phases must be loop-length-commensurate (3000 ms does not divide 6000 ms evenly — start breathing at phase 0 at t=2.6 and compute phase from loop-local time, not wall clock, so the seam is exact). **Hover:** a matrix cell raises 2 px and shows its payoff wording as a tooltip (150 ms, `--ease-snap`); hovering the focal node replays the single convergence pulse (500 ms); hovering the whale's exit path (left-panel lower-left region) re-triggers a 1 s whisper of the caveat (shadow at 10 % opacity) — optional, cut if it reads as noise. **Optional scrub:** drag across the matrix replays the sweep — low value, skip.

### Reduced-motion fallback

Static two-panel composite: left panel fully converged with all three arc labels and the accented focal node centered; right panel with the "vote coherent" row pre-highlighted and the slash cell pre-struck (strike line + two stake chips shown mid-eject); the whale rendered as a faint static outline overlapping the left panel's lower-left with the caveat caption permanently visible beneath it. 200 ms crossfade on view.

### Implementation notes

**Vehicle:** inline SVG + GSAP Core (single timeline, `repeat: -1` on the loop segment, labels for beats). Justification: this is the most choreographed piece in the group — cross-panel dimming, breathing-phase desync/resync, and an exact seam are painful in pure CSS keyframes but trivial as one labeled timeline; GSAP is loaded once for the family (A2 + A3 share it). **Complexity: M** (~18 animated elements). **Risks:** (1) arc label legibility — cap at three nested labels, min 12 px, drop shadows for contrast on curves; (2) the whale must read as "whale-ish threat," not mascot — keep it a blurred dark silhouette at ≤ 20 % opacity with no face; (3) breathing-phase seam — derive all sine phases from loop-local time as specified or the restart thumps; (4) color-blind safety — the slash cell is marked by the strike line and ejected chips, not by red alone.

---

## A3. The Arbitrable spine — two CPI calls, party-blind

*Accord knows no parties and no domain: `create_dispute(subaccord, options, evidence_hash, fee)` in, `get_ruling() → u64` out. Enforcement lives in the Arbitrable.*

### Emotional target & motion personality

**Emotional target:** competent indifference — "the protocol does not need to know who you are; it returns a number and you enforce the consequence" (Three Pillars: Emotional = detached reliability · Narrative = a messy varied world hands over a minimal payload, the black box answers, and every consequence happens back home in the consumer · Craft = weight contrast — light Corporate consumers vs. one heavy Premium spine). **Motion personality:** dual on purpose — consumers behave **Corporate** (200–400 ms, `cubic-bezier(0.2, 0, 0, 1)`-adjacent crispness) while the Accord box moves **Premium** (600 ms settle, `cubic-bezier(0.4, 0, 0.2, 1)`); the weight differential *is* the message. 0 % overshoot everywhere.

### Storyboard

**Canvas:** ~5:3 horizontal SVG. Left column: four heterogeneous consumer chips stacked — **registry** (mini list icon), **escrow** (locked coin), **authority gate** (gate/switch), **plain wallet** (wallet glyph) — each visibly different in inner detail. Center-right: a tall dark rounded box, the **Accord spine**, labeled "Accord — party-blind", with only a small protocol sigil. Between consumers and box: a dashed vertical line, the **CPI boundary plane**. Each consumer connects with exactly two arrows: an out-arrow (top) labeled `create_dispute(subaccord, options, evidence_hash, fee)` and a return-arrow (bottom) labeled `get_ruling() → u64`.

**Build (plays once, 0.0–2.0 s):**

1. **0.0–0.8 — the consumers cascade.** Four chips enter at 80 ms stagger (onset span 240 ms), each a 300 ms slide-right + fade (Corporate entrance). *Four very different programs — a registry, an escrow, a gate, a wallet.*
2. **0.3–1.0 — the spine lands (HERO).** The Accord box enters as a single heavy settle: opacity + scale 0.98→1.0, 600 ms, `--ease-accord` — visibly slower and weightier than every consumer. Label and sigil fade at 0.9. *One indifferent counterparty.*
3. **0.8–1.4 — the interface draws.** The CPI boundary plane draws vertically (400 ms); each consumer's two arrows draw from chip to box (400 ms each, staggered 60 ms per consumer). Arrow labels fade in. *Exactly two calls. Nothing else crosses.*
4. **1.4–2.0 — idle.** The box's inner glow starts breathing behind the dark glass (4 s sine). Frame = **resting state R**: all idle, all arrows at rest.

**Life loop (6.0 s, repeats ∞ from 2.0 s; one consumer fires per 1.4 s window, next departure overlapping the previous consequence — max 2 active elements, 1/3 law holds):**

5. **Window n = 0…3, local +0.00–0.50 — the full payload emerges.** Consumer n emits a wide payload chip on its out-arrow containing ≤ 5 glyphs: `parties`, `domain`, `evidence`, `terms`, `state` (consumer-specific extras). *Everything the consumer knows about the conflict.*
6. **+0.50–1.00 — the shrink at the plane.** The chip travels toward the box; as it reaches the CPI plane the excess glyphs dissolve — each drops away *before* the plane (scale 1→0.6 + fade, 200 ms, 60 ms stagger) and the chip physically narrows to three glyphs: `options`, `hash`, `fee` (a `subaccord` route tag attaches to the arrow itself, not the payload). *Accord receives only `(options, hash, fee)` — parties and domain never cross.*
7. **+0.85–1.10 — opaque processing.** The chip enters the box; a muffled glow sweeps once behind the dark glass (350 ms). No internals are ever visible. *Draw happens in here; that is all you know.*
8. **+1.00–1.30 — the answer.** A minimal return chip carrying `u64` travels back along the bottom arrow (450 ms ease-in-out) and lands on consumer n.
9. **+1.15–1.50 — consequence fires at home (the punchline).** 100 ms after the ruling lands, consumer n performs its *own* consequence inside its own chip (350 ms, secondary layer, accent flash on the consumer — the box never takes the accent): **registry** — one row flashes and its status flips; **escrow** — the locked coin splits and one part exits into the winner's slot; **authority gate** — the gate flips state; **wallet** — one internal route lights to a single output. *Enforcement and consequence live in the Arbitrable. Accord only produced the answer.*
10. **+1.40 — overlap.** Consumer n+1's payload departs as consumer n's consequence plays (two simultaneous actions max). After window 3: **7.7–8.0 rest** — all idle, glow breathing. Frame returns exactly to **R**. Seamless restart at 2.0 s-equivalent.

### Motion spec

- **Durations:** consumers 300 ms; spine entrance 600 ms (heavy/dramatic tier); payload travel 500 ms total with the shrink event at ~70 % of travel; glyph dissolves 200 ms at 60 ms stagger; glow sweep 350 ms; return chip 450 ms; consequences 350 ms; per-consumer cycle 1.4 s ×4 + 0.3 s rest = 6.0 s loop (brief's 3–8 s envelope ✓).
- **Easing:** consumers `cubic-bezier(0.2, 0, 0, 1)` (Corporate snap); spine, chips, and all travels `cubic-bezier(0.4, 0, 0.2, 1)`; every travel is ease-in-out (gentle depart, gentle land — request/response semantics); glyph dissolve exits with `cubic-bezier(0.3, 0, 1, 1)`; glow sine.
- **Stagger:** consumers 80 ms (span 240 ms ✓); arrow pairs 60 ms; in-chip glyphs 60 ms. All onset spans ≤ 400 ms.
- **Three layers:** *Primary* = the four sequential fire-cycles (payload → shrink → return). *Secondary* = per-consumer consequence animations (amplitude 30–50 %, delayed 100 ms after ruling); glyph dissolves; accent handoff to the active consumer. *Ambient* = spine's inner glow breathing (4000 ms sine), the boundary plane's slow dash-march (12 s cycle), a 2 px idle bob on the wallet chip only (3000 ms, the "plainest" actor gets the most life — small wit, zero bounce).
- **Load-bearing principles:** **Staging** (the spine is the hero and never moves again after its entrance — stoicism as characterization; the accent always sits on the *consumer* during consequence); **Straight paths, intentionally** (packets travel dead-straight along arrows — mechanical interface, sanctioned by the arcs rule for mechanical UIs; all curves live in the chip corners, not the motion); **Follow-through** (ruling lands → 100 ms → consequence; next packet trails the previous consequence); **Slow in/out** on every travel; **Solid drawing** (consistent 2 px arrow weight, chips share one corner radius, shadow behavior matches a single top-left light source across all chips).
- **Property budget:** chips = position + width (the shrink) + opacity; glyphs = scale + opacity; consequences = consumer-local transforms only. No layout properties.

### Loop & interaction model

Build once on view, then the 6.0 s four-consumer cycle repeats ∞, pausing offscreen. Seam: consequences complete by loop-second 5.7 and the 0.3 s rest returns every chip to rest pose R — pixel-identical restart. **Hover:** hovering a consumer highlights its two arrows + payload labels and dims the rest to 40 % (150 ms, `--ease-snap`); hovering the spine shows the tooltip "Accord sees: `subaccord, options, evidence_hash, fee` — nothing else." **Optional scrub (recommended):** dragging horizontally along the spine scrubs the master timeline (pointerdown maps x-position to loop time, 1:1, no easing on scrub) — this is the one interaction worth adding because it lets a reader dwell on the shrink event. **Optional click:** clicking a consumer fires just its cycle once. Keep both behind a single pointer-events layer so the SVG stays embeddable.

### Reduced-motion fallback

Static mid-story composite: all four consumers built with both arrows and labels visible; consumer ② (escrow) frozen exactly at the shrink moment — wide payload chip at the plane, excess glyphs dissolving above it, narrowed `(options, hash, fee)` chip crossing; a `u64` return chip shown mid-flight to consumer ① whose registry row is frozen mid-flash. A short static caption beneath: "two calls in, one `u64` out — enforcement lives in the Arbitrable." 200 ms crossfade on view.

### Implementation notes

**Vehicle:** inline SVG + GSAP Core (one master timeline: four labeled per-consumer sub-timelines, `repeat: -1`, scrub mapped to timeline progress). Justification: glyph-level stagger inside a moving chip plus a per-consumer cycle grid is exactly GSAP's sweet spot, and `timeline.progress` gives the scrub interaction for free; shares the GSAP bundle with A2. **Complexity: M** (~20 animated elements; the four consequence micro-animations are the bulk of the hand-work). **Risks:** (1) the dark box must read "secure/neutral," not "evil" — use the theme's elevated-surface token with a subtle inner glow, not pure black, and verify on the dark docs theme; (2) glyph legibility at 640 px — cap dropped glyphs at 5 and let icons carry meaning, abbreviating labels; (3) the shrink must happen *before* the plane (parties never cross) — the dissolve stagger must complete before the chip's leading edge reaches the dashed line, or the core claim visually breaks; (4) consumer consequences must stay amplitude-quiet (secondary tier) or they steal the spine's stoicism.

---

*End of Group A proposals. Preamble constants (`--ease-accord`, duration palettes, settle-rise entrance, family laws, chain-boundary grammar) are proposed as the shared Brand Motion Identity for all six groups; merge verbatim into the family style guide.*
