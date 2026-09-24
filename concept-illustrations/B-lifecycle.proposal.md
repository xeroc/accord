# Group B — The dispute lifecycle · Motion illustration proposals

Two looping, silent, inline animations for the Accord docs site:

- **B1 — Dispute state machine**: the full lifecycle as a traversed node-and-rail diagram ("who can do what, when").
- **B2 — Commit-reveal**: why votes are sealed before they are opened.

Audience: developers and integrators. No narration, no marketing gloss; every visual claim must be technically true. Both loops are 3–8 s, seamless, and ship a `prefers-reduced-motion` static fallback.

---

## Group preamble — Brand Motion Identity: "Ledger Calm"

Proposed shared identity so all six groups (A–F) merge into one family. Blend: **Corporate as the base archetype (≈80 % of motion)** — clean, predictable, professional, 0–3 % overshoot — with **Premium borrowed for the ≈20 % of beats that are dramatic reveals** (an envelope opening, a ruling landing, an accumulator freezing). No Playful, no Energetic: a security-adjacent arbitration protocol earns trust through restraint, not bounce.

**1. Signature easing** (carries ~80 % of all animations):

- `--ease-accord: cubic-bezier(0.2, 0, 0, 1)` — MD3/"snappy UI" curve. Decisive arrival, no overshoot. Default for entrances, state changes, badges, chips.
- Supporting cast (part of the identity, used deliberately):
  - `--ease-accord-in: cubic-bezier(0.3, 0, 1, 1)` — exits/resets only (accelerate away).
  - `--ease-accord-reveal: cubic-bezier(0.4, 0.2, 0.2, 1)` (≈ Apple HIG / gentle-float family) — reserved for the Premium reveal beats; slower in and out, theatrical.
  - `sine ease-in-out` — ambient only (breathing, gradient drift). Never for primary action.
  - `linear` — progress fills only (ruler ticks, scan lines). Never for spatial travel.

**2. Duration palette** (illustration-scale — stretched ~1.4× from Corporate's UI tiers because docs illustrations are *watched*, not operated):

| Tier | Duration | Use |
|---|---|---|
| Quick | 240 ms | Chips, ticks, icons, micro-badges |
| Standard | 420 ms | Node ignition, envelope drop, card rise |
| Slow | 700 ms | Edge traversal, panel phase flip |
| Stage | 1000–1200 ms | Dramatic reveal only (Premium beats, ≤1 per loop) |

**3. Entrance pattern — "ignite from the left"**: elements enter along the reading direction: translateX(+10 px) → 0, opacity 0 → 1, scale 0.98 → 1.0, on `--ease-accord`. Exits mirror it with `--ease-accord-in` at 70 % of the entrance duration (enter > exit).

**Shared loop conventions** (load-bearing for seamlessness across all six groups):

- **Dim-baseline state language**: every scene rests at a dim baseline (nodes/panels at ~35 % opacity, labels ~60 %); active elements ignite to 100 % and the lit layer relaxes back to baseline during the final 400–600 ms of the loop. Frame at t=0 equals frame at t=loop-end — always.
- **Ambient budget**: one ambient layer per scene (breathing at 0.98–1.02 scale / 3000–4000 ms sine, or gradient drift ≤15° over 8–20 s), never exceeding 20 % of primary energy. Only the *current* active element breathes.
- **Overshoot**: 0 % everywhere except paper-material landings (envelopes), which may settle 3 %.
- **Distance rule**: no element travels more than ⅓ of the canvas without an intermediate keyframe; ruler/progress segments count as their tick keyframes.

---

## B1. Dispute state machine

**Emotional target & motion personality.** Emotional target: *orientated calm* — "I can see the whole machine, and one case is walking through it." Motion personality: **Corporate** (predictable, decisive, 0 % overshoot), with a single Premium beat (the appeal ghost). The feeling to land: the lifecycle is *time-gated machinery*, not a maze — a token rides a rail, windows meter its pace, and named hands (juror, cranker, appellant) flip the switches.

**Scene layout** (1200 × 640 viewBox, two-row serpentine):

- Row 1 (left → right): `Created`, `Drawn`, `Review`, `Commit`.
- Right-edge U-turn curve down to Row 2 (left → right): `Reveal`, `RoundResolved`, `Final`, `Closed`.
- Appeal loop: vertical up-edge from `RoundResolved` (row 2, col 2) to `Drawn` (row 1, col 2), labeled `appellant · appeal (+bond)`, badge `3→7`.
- Branch states below row 2: `RedrawEligible` (dashed edge from `Reveal`, labeled `shortfall / tie`), with dashed exits: → `Created` labeled `cranker · redraw` (gear), and → `Failed` (terminal) labeled `attempts exhausted / cancel`.
- Each inter-state rail segment on the main spine carries a **ruler strip** (tick marks + duration label): `review` (Drawn→Review), `commit` (Review→Commit), `reveal` (Commit→Reveal), `appeal · 3d default` (RoundResolved→Final). Gear icons on the four permissionless crank edges: draw (Created→Drawn), `finalize_round`, `finalize_dispute`, `redraw`.
- Baseline: everything dim (per identity). Hero: a hexagonal **Dispute token** (≈18 px, soft accent glow) that traverses the rail.

**Storyboard** (8.0 s loop, cumulative):

| # | t (s) | Motion | Viewer now understands |
|---|---|---|---|
| 1 | 0.0–0.5 | Baseline: full diagram dim (nodes 35 %, edges 30 %, labels 60 %). `Created` breathes (ambient). | The whole map exists; one node is alive. |
| 2 | 0.5–1.1 | Token ignites at `Created` (scale 0→1 + glow, 420 ms, `--ease-accord`); node lights to 100 %. Chip `Arbitrable · create_dispute` slides in above the node (240 ms). | A case is filed by the calling program. |
| 3 | 1.1–1.9 | Token rides Created→Drawn (700 ms, ease-in-out); gear on the edge rotates 90°; chip `cranker · draw (VRF)`. `Drawn` ignites; 3 juror seat-dots pop around it (60 ms micro-cascade). | A permissionless crank drew a 3-seat panel. |
| 4 | 1.9–2.9 | **Review window**: token crawls the ruler segment (ticks fill left→right, linear, one tick ≈ 90 ms); evidence glyph pulses at `Review`; node ignites on arrival. | Nothing happens until a window elapses — time is a first-class actor. |
| 5 | 2.9–3.6 | **Commit window** ruler (shorter — ticks fill faster); chip `juror · commit`; a sealed-envelope micro-glyph drops onto the node (160 px fall, ease-in, 3 % squash-settle). `Commit` ignites. | Jurors seal votes inside a window. |
| 6 | 3.6–4.3 | **Reveal window** ruler; chip `juror · reveal`; envelope glyph flips open (scaleX 1→0→1 face-swap, 240 ms). `Reveal` ignites. | Seals come off, still window-gated. |
| 7 | 4.3–4.9 | Edge Reveal→RoundResolved (420 ms, no ruler — this is an action, not a window): gear spins, chip `cranker · finalize_round`. Node ignites; a tally badge `✓` pops. Simultaneously the `RedrawEligible` and `Failed` dashed branches pulse once to 60 % opacity for 400 ms, then relax. | A crank tallies the round; shortfall/tie and exhaustion exits exist. |
| 8 | 4.9–6.2 | **Appeal window** (longest ruler, labeled `3d`): token *holds* at `RoundResolved` (gentle 1.5 px attention bounce every 900 ms). During the hold — the Premium beat — the appeal up-edge draws itself (stroke-dashoffset, 700 ms, `--ease-accord-reveal`), chip `appellant · appeal (+bond)` fades in, badge `3→7` pops, and a **ghost token** (40 % opacity) travels RoundResolved→Drawn (800 ms) and dissolves into `Drawn` with one ring ripple. | During the wait, anyone can appeal: back to a doubled panel. No appeal → the wait ends it. |
| 9 | 6.2–6.9 | Token proceeds to `Final` (420 ms); chip `cranker · finalize_dispute` + gear; a `Ruling` badge scales in 0.9→1.0 (700 ms, `--ease-accord-reveal`). | The ruling becomes final after the window closes. |
| 10 | 6.9–7.4 | Token Final→Closed (420 ms); chip `cranker · settle` + gear; `Closed` ignites with a checkmark draw (240 ms stroke). | Settlement closes the case; the filer reads the ruling lazily. |
| 11 | 7.4–8.0 | Hold 200 ms (whole lit path glows), then the lit layer relaxes to baseline (400 ms, `--ease-accord-in`); token fades at `Closed`. Frame 8.0 == frame 0.0. | The machine resets; another dispute may run. |

**Motion spec.**

- **Easings**: node ignitions/chips/badges `--ease-accord` (0.2, 0, 0, 1); rail traversal ease-in-out (cubic-bezier 0.4, 0, 0.2, 1); ruler tick fill `linear` (progress exception); resets `--ease-accord-in` (0.3, 0, 1, 1); appeal-ghost beat `--ease-accord-reveal`.
- **Durations**: 240 ms (chips, ticks, badges) / 420 ms (ignitions, short edges) / 700 ms (long edges, ghost path) / 1000–1200 ms only as the composite appeal beat. Ruler pacing encodes window *relative* length: review ≈ commit + 40 %, appeal ≈ 2× review — deliberately non-literal (3 days would be unwatchable); tick counts carry the ratio.
- **Stagger**: seat-dots 60 ms micro-cascade; ruler ticks ~90 ms/tick (wave pattern); chips trail their edge by 80 ms.
- **Three layers**: *Primary* — token traversal + node ignition (the lit path). *Secondary* — actor chips, gear rotations, ruler tick fills, tally/ruling badges, ghost appeal traversal. *Ambient* — breathing on the single active node (0.98–1.02, 3000 ms sine) + a ≤10° gradient drift on the rail over 12 s.
- **Load-bearing principles**: *Staging* (dim baseline → one lit path funnels attention; branches stay dim until adjacent), *Anticipation* (each ruler fill is a held breath before a node fires), *Follow-through* (arrival = expanding ring ripple 18→30 px, not token bounce — expresses energy at 0 % overshoot), *Straight-ahead vs pose-to-pose* (pose-to-pose between nodes; the crawl inside rulers is straight-ahead), *Arcs* (U-turn at the right edge is a semicircular path, never a corner).
- **1/3 rules**: token never crosses >⅓ canvas without tick keyframes; simultaneously moving: token + at most one chip + its ticks.

**Loop & interaction model.** The loop is frame-identical at 0.0 s and 8.0 s via the dim-baseline reset (beat 11), so it can be embedded as CSS animation iterations or a GSAP `repeat: -1` timeline with no jump. Optional affordances: `hover` pauses and reveals a thin scrubber mapped to the 8 s timeline (drag to any state); hovering a *node* while paused could show its window duration — defer to site-wide interaction conventions. Default: autoplay, silent, ~0.6× brightness at rest.

**Reduced-motion fallback.** One static keyframe at beat 10's end state (t ≈ 7.4 s): entire main path lit end-to-end, token parked on `Closed`, all actor chips and gear labels visible, all four ruler segments fully filled with duration labels, appeal loop and `RedrawEligible`/`Failed` branches drawn dashed at 60 %. Crossfade in over 300 ms on load; no traversal, no gear spin, no ghost.

**Implementation notes.**

- **Vehicle: inline SVG driven by a GSAP timeline** — the scene is natively node-and-edge (stroke-dashoffset edge draws, per-node transforms), and a timeline gives exact loop seams plus the hover-pause/scrub affordance for free. (Pure CSS keyframes work if scrub is dropped.)
- **Complexity: L** — 8 nodes, 11 edges, ghost traversal, ruler strips, chips. Budget the branch edges as static dashed paths with a single opacity pulse, not timelines.
- **Risks**: (a) cognitive overload — mitigated by dim baseline + one lit path + branch pulse limited to beat 7; (b) reset flicker — the 400 ms relax crossfade must touch opacity only; (c) gear glyph illegibility <16 px — ship gear as a 16 px minimum icon that rotates in 15° steps (mechanical, not continuous spin); (d) the `RedrawEligible → Created` return edge is long — route it as a shallow arc under row 1, dashed, 40 % opacity, so it reads as a side note.

---

## B2. Commit-reveal (why votes are sealed)

**Emotional target & motion personality.** Emotional target: *earned relief* — secrecy builds a quiet tension, the opening pays it off with verification. Motion personality: **Corporate** for the commit phase (sealed, procedural, slightly muffled), **borrowing Premium for the reveal** — the single Stage-tier beat of the piece. The micro-story: seal independently → wait → open and prove. The copycat inset is the punchline that justifies the whole design.

**Scene layout** (1200 × 560 viewBox, two main panels + inset):

- **Panel 1 — `1 · Commit`** (left 42 %): three juror avatars across the top; a horizontal **chain strip** along the bottom where sealed envelopes land. Each sealed envelope shows an opaque face with a truncated hash label (`#a3f9…c2`-style) and a wax-seal lock glyph.
- **Panel 2 — `2 · Reveal`** (right 42 %): the chain strip continues; a small **Accord program node** sits above it with a `hash(vote ∥ salt)` pipeline glyph. Match lines connect revealed cards back to their commit slots.
- **Inset — the copycat** (bottom-center strip, ~16 % height): one juror with narrowed eyes and a scan-line gaze, active only during the commit phase.
- Static footnote (bottom-right, never animates): *Scalar (median) disputes widen the preimage: `hash(vote_le8 ‖ salt ‖ juror)` — the commit hash is bound to the juror, so one juror's seal can't be copied by another.*
- A timeline caret under both panels marks the active phase.

**Storyboard** (6.5 s loop, cumulative):

| # | t (s) | Motion | Viewer now understands |
|---|---|---|---|
| 1 | 0.0–0.5 | Baseline: panel frames breathe (ambient), phase labels dim, chain strips empty at 35 %. | A two-phase procedure is about to run. |
| 2 | 0.5–1.0 | Panel 1 header slides in (ignite-from-left); 3 juror avatars cascade in (60 ms stagger); each summons a sealed envelope rising 20 px from the avatar (240 ms, ease-out). | Three independent jurors each hold a sealed vote. |
| 3 | 1.0–2.0 | Envelopes **drop** onto the chain strip — ~140 px fall, ease-in, 3 % paper squash-settle, 160 ms wave stagger (total stagger < 500 ms). On each landing: wax seal flashes, hash label types on (~4 glyphs, 60 ms/glyph), one chain block appends beneath (slide-in + link draw). | `hash(vote, salt)` is now on chain — content invisible. |
| 4 | 2.0–2.6 | **Copycat beat**: inset ignites; the copycat's gaze darts along the sealed wall (±60 px scans, 150 ms each, ease-out); `?` bubbles pop twice; settles on `∅` (nothing found). Inset dims. | Without visible votes there is nothing to copy — independence is enforced. |
| 5 | 2.6–3.2 | **Held beat** (anticipation): the sealed wall glows once; timeline caret sweeps Panel 1 → Panel 2 (420 ms); Panel 2 header `2 · Reveal — {vote, salt}` enters. | The phase flip is a gate, not a choice. |
| 6 | 3.2–4.4 | **The reveal (Stage beat, 1200 ms)**: envelopes flip open one by one (150 ms stagger; scaleX 1→0 → face-swap → 0→1, 420 ms each, `--ease-accord-reveal`); from each, a `{vote, salt}` card rises 24 px (ease-out). The Accord node wakes: per card, the pipeline glyph compresses (scaleY 1→0.6→1), the recomputed hash string slides toward the matching commit slot (240 ms), a match line draws (stroke, ease-out), and a `✓` ticks. | The program re-hashes every opening and matches it against the seal — you can't open a vote you didn't seal. |
| 7 | 4.4–5.2 | Two of the three vote cards share a hue and drift 8 px toward each other (420 ms, sine ease-in-out) — a Schelling point quietly forming; third card stays apart. Panel 2 glow settles. | Independent sealed votes still converge — that's the point of the ritual. |
| 8 | 5.2–6.5 | Reset: cards fade down and envelopes relax closed (300 ms, `--ease-accord-in`); chain blocks dim to baseline; inset already dark; caret returns to Panel 1. Frame 6.5 == frame 0.0. | The ritual is repeatable for the next round. |

**Motion spec.**

- **Easings**: commit phase `--ease-accord` (0.2, 0, 0, 1) throughout; envelope drop ease-in (fall) + 3 % squash-settle (paper material 1.0×); reveal beat `--ease-accord-reveal` (0.4, 0.2, 0.2, 1); card rise ease-out; match-line draw ease-out; resets `--ease-accord-in` (0.3, 0, 1, 1); convergence drift sine ease-in-out.
- **Durations**: 240 ms (chips, seals, ticks, type-on) / 420 ms (drops, flips, card rise, caret) / 700 ms none needed / **Stage 1200 ms** for the composite reveal (flip + rise + re-hash + match per envelope overlaps inside it). Hold beats (2.0–2.6, 2.6–3.2) are *pauses*, not motion — Premium's "generous pauses" doing narrative work.
- **Stagger**: avatars 60 ms; envelopes 160 ms wave (deliberate wave-pattern exception to the simultaneous-⅓ rule — the three drops read as one gestalt; total stagger 320 ms < 500 ms budget); flips 150 ms; hash-match cycles trail their flip by 120 ms.
- **Three layers**: *Primary* — the envelopes (drop, flip) and their `{vote, salt}` cards. *Secondary* — hash type-on, chain block appends, pipeline glyph, match lines, `✓` ticks, caret, copycat inset. *Ambient* — panel-frame breathing (0.99–1.01, 4000 ms, offset 50 % between panels so they never sync) + one shimmer sweep across the chain strip per loop (2000 ms sweep, 2500 ms pause, ≤30 % opacity).
- **Load-bearing principles**: *Anticipation* (the sealed wall + held beat 2.0–3.2 s is the coiled spring; the copycat's failure sharpens it), *Staging* (Panel 1 is sealed/graphite, Panel 2 opens into the accent hue — color carries the phase), *Slow in / slow out* (the flip eases both ends; the payoff decelerates), *Exaggeration, barely* (copycat eye-narrow + `∅` — one degree past neutral, never mockery), *Follow-through* (paper squash on landing; card wobble ≤2° after rise).
- **Property discipline**: flips are fake-3D via scaleX face-swap (no WebGL, no perspective matrices); opacity is never the only channel for a state change (seal↔open also swaps face content and label).

**Loop & interaction model.** Loop seam guaranteed by the dim-baseline reset (beat 8): empty strips, breathing frames — identical to 0.0 s. Optional affordance: `hover` pauses on the current phase; a small `1 | 2` phase toggle under the panels lets a reader jump the caret between Commit and Reveal states (both are stable tableau). No scrubbing needed — the two-phase story reads linearly.

**Reduced-motion fallback.** Static composite, no crossfade between phases: left panel shows the three sealed envelopes on the chain strip with hash labels + the copycat inset frozen mid-squint over `∅`; right panel shows the three opened envelopes, `{vote, salt}` cards, recomputed hashes matched to commit slots with drawn `✓` lines; footnote visible. Crossfade in over 300 ms on load.

**Implementation notes.**

- **Vehicle: inline SVG + GSAP timeline** — the piece is timeline-shaped (phase gates, staggered waves, stroke-draw match lines), and GSAP's timeline labels (`commit`, `reveal`) map 1:1 onto the phase-toggle affordance. Lottie is a valid alternative only if an AE artist owns the asset; hand-authoring this many labeled interactive pauses in Lottie is worse than code.
- **Complexity: M** — few elements, but the flip face-swap, type-on, and match-line choreography each need care.
- **Risks**: (a) hash text illegibility at inline size — use ≤4-glyph truncated labels at ≥12 px monospace, the *pattern* matters, not the value; (b) fake-3D flip reads cheap if the face-swap misses a frame — swap faces exactly at scaleX 0.02, keep a 1 px edge visible; (c) copycat drifting into mockery — keep the inset ≤16 % height, monochrome, `∅` not a red X; (d) the convergence beat (beat 7) must stay subtle — 8 px drift max, or it overclaims what commit-reveal alone guarantees.
