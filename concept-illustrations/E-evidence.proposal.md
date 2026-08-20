# Group E — Evidence: motion illustration proposals

Source brief: `concept-illustrations/E-evidence.md` (E1 evidence pipeline, E2 per-round evidence film-strip).
Audience: developers/integrators reading Accord technical docs — smart, skeptical, allergic to fluff.
Shared mission for this group: make the viewer **feel "only the drawn get keys"** (E1) and **"every panel sees everything filed so far"** (E2) without a single line of narration.

Both illustrations are data-in-transit diagrams with a confidentiality story. The motion vocabulary below treats cryptography as *material*: locks seal with weight, keys are machined from identity chips, and the chain holds nothing but 32 immutable bytes. The one honest trust assumption — the operator sees plaintext — is staged plainly, never hidden.

---

## Group preamble — Brand Motion Identity ("Precision Instrument")

**Archetype derivation.** Corporate base × Premium accents. A security-adjacent arbitration protocol docs site wants the *clean, professional, dashboard* discipline of Corporate (200–400ms band, `cubic-bezier(0.2,0,0,1)`) with the *elegant, minimal* restraint of Premium (no bounce, no decoration). The result reads as a precision instrument: everything moves as if machined, nothing wobbles, nothing begs for attention. Energetic/Playful are rejected outright — overshoot and bounce read as toys next to slashing economics.

**Three constants (apply to ~80% of all motion in the merged six-group family):**

1. **Signature easing** — `--accord-ease: cubic-bezier(0.2, 0, 0, 1)` (Material 3 / snappy UI standard). Used for all on-screen movement and transit legs. The workhorse.
   - Support curves (named, reused everywhere):
     - `--accord-emphasized: cubic-bezier(0.05, 0.7, 0.1, 1)` — entrances, seals landing, attention moments (MD3 Emphasized).
     - `--accord-exit: cubic-bezier(0.3, 0, 1, 1)` — dismissals, ejections, loop-reset fades (MD3 Accelerate).
     - `--accord-float: sine ease-in-out` — all ambient/looping layers only.
2. **Duration palette** — quick **180ms** (state flips, key derivations, verify ticks) / standard **420ms** (transit legs, frame fills, panel expands) / slow **900ms** (seals, ladder climbs, resolution holds). Hero narrative beats inside a looping illustration may use 1.5× standard (~630ms); nothing in the family exceeds 1200ms except deliberate dramatic holds.
3. **Entrance pattern — "settle-in."** Every entering element: opacity 0→1 + rise 10px + scale 0.97→1.0, `--accord-emphasized`, no overshoot. One consistent entry style across all six groups so merged pages feel like one hand.

**Family rules (non-negotiable, derived from the motion-design skill):**

- **Overshoot policy:** 0% positional overshoot family-wide. Corporate permits 0–3%; we spend it only on ≤2% scale-settle pulses for landing ticks (a checkmark landing, a thumbnail seating). Never on position.
- **Directional easing:** entrances decelerate, exits accelerate, on-screen smooths both ends, ambient loops on sine.
- **Three layers mandatory:** primary (the story beat) + secondary (richness: keys, chips, ticks) + ambient (chain-strip breathing, conduit flow, shimmer). A flat animation is a defect.
- **1/3 rules:** no element travels >1/3 of the frame (960px viewbox ⇒ ≤320px) without an intermediate keyframe; never more than 1/3 of elements in active motion simultaneously. Transit legs are staged so each leg is a sub-320px hop.
- **Stagger discipline:** micro-cascade 20–40ms, standard 50–100ms; total stagger budget <500ms per cascade.
- **Path language:** data-in-transit travels shallow arcs (≤6% sag) — purposeful diagonals with just enough curve to feel dispatched, not robotic. Angular paths are reserved for failure states (not used in Group E).
- **Shared visual semantics** (so E-group diagrams compose with A–D and F):
  - **Ink** (solid stroke) = on-chain fact. On-chain artifacts are staged on their own band, never occluded, fade last on reset.
  - **Tint** (40% fill of the identity color) = ciphertext in transit.
  - **Amber tag** = an honest trust assumption, pinned plainly (Group E owns the first one: "operator sees plaintext").
  - **Ghost** (40% opacity + dashed outline) = zero-sentinel / inherit marker.
  - **Identity chips** = shortened pubkey labels (`9a1K…mQp`) from which key glyphs visually derive. Keys are never free-floating; they are always machined from an identity.
- **Loop contract:** every illustration ends in a tableau identical to its t=0 state (element positions/opacity equal) so the loop point is invisible. Resets use `--accord-exit` and clear narrative artifacts before structure.
- **Accessibility contract:** every illustration ships a `prefers-reduced-motion` static keyframe (crossfade-in ≤500ms, then still) that tells the complete story in one frame.

---

## E1. The evidence pipeline (hash on-chain, bytes re-encrypted to the drawn)

**Emotional target & motion personality.** Emotional target: *guarded confidence* — "my bytes are sealed, and only the drawn hold keys." Motion personality: **Corporate** core (precise, secure, dashboard-grade timing) with one **Premium** accent beat on the seal (slow, weighted, zero overshoot — a vault door, not a toy latch).

**Scene layout (960×540 viewbox).** Filer card left (`Arbitrable · filer`, x 48–248, y 120–300) containing the manifest tree (3 file-leaf chips folding up into a `sha256 root` chip). Operator card center (`evidence operator`, x 388–568, y 150–290) with an expandable `Round.jurors[]` panel beneath it. Juror column right (x 748–928): three solid juror cards (drawn) + one dashed slot (undrawn). A conduit channel (y≈210) connects filer→operator; fanned arcs connect operator→each juror (max leg ≈185px, within the 1/3 rule). Chain strip spans the bottom band (y 470–530): muted blocky cells with one highlighted 32-byte hash cell under the operator.

**Storyboard (8.0s loop, cumulative timestamps):**

1. **0.00–0.90 — Assemble & fold.** Three file chips (`contract.md`, `invoice.pdf`, `chat.log`) settle into the filer card (settle-in, stagger 80ms), then each folds 48px up into a single `sha256 root` chip (120ms per hop, 50% overlap). *Viewer now understands: evidence is packaged as one hash — files become a root (its Merkle-root nature).*
2. **0.90–1.70 — Seal + derive key.** A lock shackle closes over the root chip (rotation −18°→0° plus a 6px drop, `--accord-emphasized`, 260ms — the Premium beat). The operator identity chip `9a1K…mQp` slides 60px from the operator card to the keyhole, and a key glyph is machined from it (scale 0.6→1 + fade, 220ms). *Viewer: the filer encrypts to the operator's on-chain identity — the key literally comes from the pubkey.* In parallel (0.90–1.90), the chain strip's hash cell types in 8 monospace hex chars (per-char 60ms settle) while everything else stays still. *Viewer: the chain stores 32 bytes per round — nothing more.*
3. **1.70–2.90 — Transit leg 1 (filer → operator).** The sealed envelope anticipates (scale squeeze to 0.97, 90ms), then travels 170px along a shallow arc (12px sag) with a mid-travel keyframe (scale dips to 0.96 at apex), decelerating into the operator. *Viewer: ciphertext moves filer→operator; only the hash rests on-chain.*
4. **2.90–3.80 — Operator unlock + the honest tag.** The operator's key rotates 30°, the shackle opens (200ms), and a soft plaintext glow appears *inside the operator card only*. An amber tag **"operator sees plaintext"** pins to the card's corner (settle-in, 240ms) and stays. The `Round.jurors[]` panel expands beneath the operator (height 0→96px, `--accord-emphasized`, 320ms) listing three pubkeys; a fourth dashed row stays empty. *Viewer: the one trust blob, stated plainly — and the draw list is on-chain.*
5. **3.80–4.90 — Re-key per drawn juror (the access-control beat).** Three key glyphs machine themselves from the three listed pubkeys (stagger 90ms, scale+fade 200ms each); the dashed row flashes a brief `∅ no key` label (120ms) — nothing derives. The envelope splits into three sealed copies (a Y-split, 280ms), each tinted with its juror's identity color. *Viewer: keys derive only from `Round.jurors[]` — only the drawn get keys.*
6. **4.90–6.00 — Transit leg 2 (fan-out).** The three copies travel ≈185px along fanned arcs to the three juror cards (stagger 70ms); the chain hash cell pulses once (secondary). *Viewer: each drawn juror receives their own ciphertext, keyed to them alone.*
7. **6.00–7.00 — Unlock + verify.** Each juror's derived key rotates and unseals its copy (stagger 80ms); inside each card, two 8-hex chips — `recomputed` and `on-chain` — slide together 16px and lock with a draw-on checkmark (stroke draw, 160ms, ≤2% scale-settle pulse on landing). *Viewer: the juror verifies sha256 against the chain — the bytes match the 32 on-chain bytes.*
8. **7.00–8.00 — Resolve + reset.** Hold 300ms on the fully-lit tableau, then all narrative artifacts (envelopes, derived keys, conduit flow, amber tag, typed hex) fade with `--accord-exit` (280ms). Structural outlines and the empty leaf row remain; the hash cell's chars dissolve out last (on-chain ink fades last per family semantics) so t=8.0 exactly equals t=0.0. *Viewer: transports are ephemeral; the commitment is permanent.*

**Motion spec.**

- Durations: seal 260ms · key derive 200–220ms · transit legs 520ms each (standard 420ms × distance factor 1.24 for the arc) · panel expand 320ms · verify tick 160ms · reset fade 280ms.
- Easing: transit + on-screen `--accord-ease`; seals, panel expand, tag pin `--accord-emphasized`; reset `--accord-exit`; ambient sine.
- Stagger: juror keys 90ms (total 270ms), fan-out copies 70ms (210ms), verify beats 80ms (240ms) — all inside the <500ms budget.
- Three layers: **Primary** = envelope transit + seal/unseal beats. **Secondary** = key derivations, identity-chip slides, hex typing, verification ticks. **Ambient** = conduit dash-flow (sine, continuous), chain-strip cell breathing glow (3s period), faint 2% opacity pulse on the operator card while plaintext is exposed.
- Load-bearing principles: **Anticipation** (pre-launch squeeze; shackle cocks −18° before closing), **Follow-through / overlapping action** (shackle settle after seal; juror tint arrives 80ms after the copy lands), **Staging** (the chain strip owns its bottom band and is never occluded — the 32 bytes are the anchor of the composition), **Arcs** (all transit paths), **Slow in / slow out** (decelerated landings on every arrival), **Secondary action** (key shimmer at derivation). Choreography: hero (the envelope) always enters first or moves furthest; counter-motion — during leg-2 fan-out the ambient conduit flow reverses direction at 25% speed.
- 1/3-rule audit: longest single travel ≈185–210px < 320px; busiest beat (4.90–6.00) has 3 of ~20 elements in motion.

**Loop & interaction model.** Loop point is tableau-equal (beat 8 restores the t=0 state), so `repeat: -1` shows no seam. Optional affordances: hover pauses the timeline (cursor + "paused" state on the caption); pointer-drag horizontally scrubs timeline progress 0→100%; keyboard focus + Enter toggles play/pause. Chapter markers (no visible UI, just scrub sensitivity) at 0.9s / 2.9s / 4.9s / 6.0s let a scrubbing reader land on seal / trust / fan-out / verify.

**Reduced-motion fallback.** Single static keyframe of the beat-7 tableau: all three juror cards unlocked with matched hex-chip pairs and checkmarks, keys visibly derived from the three `Round.jurors[]` pubkeys, the dashed undrawn slot labeled `∅ no key`, the amber "operator sees plaintext" tag pinned, chain strip showing the lit 32-byte hash cell. Fade-in over 500ms, then fully still. The static frame alone must communicate: hash on-chain, bytes re-keyed per drawn juror, operator sees plaintext.

**Implementation notes.** Vehicle: **inline SVG + GSAP timeline** (`repeat: -1`, master timeline with labeled chapters) — deterministic looping, crisp stroke-consistent lock/key art, trivial `progress()` scrub binding, and a one-line reduced-motion freeze (`timeline.pause(0.98)` at the fallback frame or swap to the static variant). Complexity: **L** (~20 animated nodes, two transit systems, split-envelope choreography). Risks: (1) hex-typing can drift into hacker-movie cliché — keep it to 8 muted monospace chars, no glow; (2) lock/key iconography must be one stroke weight or the seal beat looks clip-arty; (3) the operator must read as a *service*, not a vault — the identity chips and the amber tag carry that semantics, keep the card visually lighter than the filer card.

---

## E2. Per-round evidence hashes (counter-evidence arrives by appeal)

**Emotional target & motion personality.** Emotional target: *accumulating fairness* — "whatever gets filed, every later panel sees all of it." Motion personality: **Corporate** with a documentary film-strip character — measured wave cadence, one frame exposed at a time, mechanical rewind.

**Scene layout (960×540 viewbox).** Film strip band across the middle (y 150–250): four frames, each 150×90, at x 90 / 290 / 490 / 690, labeled `evidence_hashes[0..=3] · on-chain`, with sprocket dots along its top and bottom rails. Below it, an appeal ladder of four rising steps (baseline y=430; step heights 60/110/160/210 left→right, each 200px wide) carrying juror-dot clusters of 3 / 7 / 15 / 31. Above each step floats a dossier card (180×80) that accumulates frame thumbnails.

**Storyboard (7.0s loop, cumulative timestamps):**

1. **0.00–0.50 — Establish.** The four frame outlines stroke-draw on (220ms each, stagger 60ms); the ladder steps rise from the baseline (stagger 70ms, `--accord-emphasized`, zero overshoot) and the 3/7/15/31 dot clusters fade in as their steps land. *Viewer: four on-chain slots, an appeal ladder, panels that double.*
2. **0.50–1.40 — Filing writes frame 0.** A filing chip (`Dispute filed · manifest hash`) slides 60px in from off-frame left and docks into frame 0; the frame fills (opacity + scale 0.96→1, 280ms) and a hex glyph `a3f9…` settles inside. Dossier 0 receives a thumbnail copy of frame 0 via a 90px arc (300ms). *Viewer: filing commits round-0 evidence — the manifest hash lands in slot 0.*
3. **1.40–2.50 — Appeal 1 writes frame 1.** Step 1 activates (7 dots brighten, 180ms); an appeal chip anticipates (4px pull-back, 80ms) then arcs into frame 1, which fills (280ms, hex glyph `77c2…` settles). Dossier 1 stacks: the f0 thumbnail glides 110px over as a *copy* (the original stays in dossier 0), then f1 lands on top (stagger 90ms). *Viewer: an appeal may add new evidence, and the new panel's dossier visibly contains everything prior.*
4. **2.50–3.60 — Appeal 2 inherits (the sentinel beat).** Step 2 activates (15 dots). Frame 2 receives **no fill** — a translucent dashed ghost settles into it (sine float-in, 40% opacity, label `00…00`). Dossier 2 stacks f0+f1 as a *carried-forward pair*: both thumbnails slide 130px from dossier 1 in formation, with a bracket underline drawing beneath them and the microcopy `carried forward` (160ms stroke draw). The ghost frame is visibly absent from the dossier. *Viewer: the zero-sentinel means "inherit prior rounds" — not "no evidence." Counter-evidence accumulates without any party model.*
5. **3.60–4.70 — Appeal 3 writes frame 3.** Step 3 activates (31 dots as an 8×4 grid); frame 3 fills with hex glyph `e1b0…`; dossier 3 stacks the carried pair (f0, f1) plus the new f3 (stagger 80ms). *Viewer: the final 31-juror panel's dossier is the accumulated non-zero set {0, 1, 3}.*
6. **4.70–5.60 — Resolution hold.** A thin underline sweeps beneath dossier 3 (600ms, `--accord-ease`) with the label `non-zero set → round-3 jurors`; thumbnails shimmer gently (ambient sine); ladder dot clusters breathe at 2% scale, phase-offset per step. *Viewer: rest state of the concept — later jurors receive the sum of all non-zero hashes.*
7. **5.60–6.60 — Rewind (honestly framed).** A `next Dispute` chip blinks once beside frame 0 (120ms) so the rewind reads as a fresh case, never a chain rollback. Frame fills eject right-to-left in reverse stagger 50ms (`--accord-exit`, 220ms each); the ghost sentinel dissolves last. Dossiers fold down (scaleY 1→0, origin bottom, stagger 60ms); the ladder deflates to baseline (steps compress, 300ms).
8. **6.60–7.00 — Rest on skeleton.** Frame outlines fade to 0 (`--accord-exit`, 250ms); only the strip's title label and baseline rail persist — exactly the t=0 tableau. Loop point.

**Motion spec.**

- Durations: frame fill 280ms · dossier thumbnail arc 300ms · step activation 180ms · bracket draw 160ms · sweep 600ms · rewind per-frame 220ms.
- Easing: fills/stacks/steps `--accord-emphasized` (entrances), sweep and on-screen alignment `--accord-ease`, ejections and fold-downs `--accord-exit`, ghost float and shimmer `--accord-float` (sine).
- Stagger: wave pattern per the data-visualization budget, 30–60ms between frame events; each cascade totals <300ms.
- Three layers: **Primary** = frame fills / sentinel + dossier stacking. **Secondary** = ladder activations, filing/appeal chips, hex glyphs, the carried-forward bracket, the underline sweep. **Ambient** = sprocket-dot slow sine drift (±8px, never linear), dot-cluster breathing during holds, thumbnail shimmer.
- Load-bearing principles: **Staging** (the strip owns its band and is never occluded by dossiers; the ghost's translucency isolates it as a marker, not a value), **Anticipation** (appeal chip pull-back before its arc), **Overlapping action** (carried pair moves in formation; f3 lands while the bracket is still drawing), **Arcs** (chip and thumbnail paths), **Slow in / slow out** (step rises decelerate to zero velocity at the top), **Timing** (the 0.9–1.1s per-round cadence is regular enough to feel mechanical — documentary, not dramatic). Choreography: the wave — attention always marches left→right one frame at a time; during any frame event, only that frame's column (frame + step + dossier) is active, satisfying the 1/3-elements rule by construction.
- 1/3-rule audit: longest travel = carried pair 130px, well under 320px; no beat exceeds 4 simultaneously active elements.

**Loop & interaction model.** Beats 7–8 restore the exact t=0 tableau, so the loop point is invisible. Optional affordances: hover pauses; clicking any frame jumps the playhead to that round's chapter (markers at 0.5 / 1.4 / 2.5 / 3.6 / 4.7s) — "scrub by round" doubles as the concept's own navigation metaphor; keyboard focus + Enter toggles play/pause.

**Reduced-motion fallback.** Single static keyframe of the beat-6 tableau: frames 0, 1, 3 filled with their hex glyphs; frame 2 a translucent dashed ghost labeled `00…00`; ladder at full height with 3/7/15/31 dot clusters; dossier 3 stacked {f0, f1, f3} with the `carried forward` bracket on the pair; underline label `non-zero set → round-3 jurors` present. Fade-in over 500ms, then still. The static frame alone must communicate: slots fill or inherit, and each panel's dossier is the accumulated non-zero set.

**Implementation notes.** Vehicle: **inline SVG + GSAP timeline** — the stacking/rewind choreography needs a labeled master timeline and per-round chapters, which CSS keyframes handle poorly; SVG keeps 31-dot clusters crisp and themeable via CSS custom properties. Complexity: **M** (~14 animated groups, repeating wave structure). Risks: (1) "inherit" vs "empty" confusion — mitigated by the triple signal (ghost + `00…00` label + carried-forward bracket and dossier omission); (2) the 31-dot cluster turns to noise at small render sizes — cap dots at 4px radius and grid them 8×4; (3) rewind could misread as chain rollback — the `next Dispute` chip plus fast mechanical exit easing keeps the metaphor honest; (4) don't let the film-strip sprockets animate linearly — sine oscillation only, per the no-linear-spatial-movement rule.
