# Group D — Economics · Motion Illustration Proposals

Five looping, silent, inline explainer animations (D1–D5) for the Accord docs site. These are **money-flow diagrams**: tokens are rendered as particle streams and ledger counters, never as hand-waving arrows. Domain language is used exactly as in the briefs (`Juror`, `Subaccord`, `Dispute`, `Round`, `Ruling`, coherence, appeal bond, accumulator, VRF, `active_draws`, `settle_round`, `stake_vault`, `fee_vault`, `fees_earned`, `staked`, `pending_withdrawal`).

---

## Group preamble — Brand Motion Identity (mergeable across Groups A–F)

Derived from the **Corporate** archetype (clean, professional, trustworthy) with **Premium** restraint on hero beats (settlement, finality, the shackle opening). Security-adjacent protocol docs: nothing bounces, nothing wiggles, everything *settles*.

**Three constants:**

1. **Signature easing — "accord-settle":** `cubic-bezier(0.2, 0, 0, 1)` (Material 3 standard). Carries ~80% of all motion. Zero overshoot, ever. Permitted satellites: emphasized entrance `cubic-bezier(0.05, 0.7, 0.1, 1)` (MD3 Emphasized); accelerate-exit `cubic-bezier(0.3, 0, 1, 1)` (loop-seam crossfades); ambient float `cubic-bezier(0.4, 0, 0.2, 1)` (sine-like, background only).
2. **Duration palette:** quick **240ms** (ticks, chips, flashes) · standard **400ms** (cards, counters, arrows) · slow **640ms** (hero beats: beam pass, shackle open, ruling stamp). Loop-level narrative beats may run 800–1600ms (dramatic-reveal register); total loop 3–8s.
3. **Entrance pattern — "settle-in":** opacity 0→1 + translateY(−10px)→0 (+ scale 1.005→1.0), emphasized decelerate, 0% overshoot. Elements land; they do not fly. Spatially consistent: entries always arrive from above or from the flow direction of their token stream — never from random edges.

**Group-D shared vocabulary (money as material):**

- **Token particles.** `staking_token` = heavy coin particles (rigid material: 1.2× duration, 0% overshoot, straight paths with one arc keyframe). `fee_token` = light grain particles (fluid: 0.9× duration, 5% settle). Particle travel obeys the 1/3 rule — no particle crosses more than ⅓ of frame width without a keyframe change (direction inflection or counter tick).
- **Ledger counters.** All numbers use tabular-nums; count-ups are 400ms `accord-settle` tweens with a 120ms post-tick brightness flash. Numbers are the source of truth; particles are illustration.
- **The slash convention (critical, D2-derived):** slashing renders as a red row-flash + number down-tick on an account ledger. **No particle ever leaves a vault for a slash.** Referenced again in D4.
- **Vaults** are visually static, solid-bodied containers. Their only animations are a ≤1.005 scale "breath" and an "unchanged" badge — stillness is the message.
- **Color tokens** (map to site CSS vars, do not hardcode): `--tok-stake` (cool, slate/indigo), `--tok-fee` (warm amber), `--state-coherent` (green), `--state-incoherent`/slash (red), neutrals for chrome. Instruction arrows are color-coded by token and never cross colors.
- **Ambient layer (shared):** faint accumulator-grid drift or scanline at 6–8% opacity, 4–6s sine period, moving counter to the primary flow direction at 20–30% speed.

---

## D1. Two mints, two vaults (token topology + invariants)

**Emotional target:** audit-grade reassurance — "the books balance by construction."
**Motion personality:** Corporate — a calm guided tour of a diagram auditors will screenshot; precision over spectacle.

### Storyboard (7.2s loop)

Frame: the `Subaccord` container centered; `stake_vault` and `fee_vault` cards inside; instruction chips in side columns; two boxed invariant equations at the bottom.

1. **0.0–0.9 — Container establishes.** The Subaccord border traces itself (SVG stroke draw, 640ms, accord-settle); the two vault cards settle-in from above, 80ms stagger, ~24px travel. *Viewer: here is one closed system with two separate stores.*
2. **0.9–2.3 — Instructions wire up.** Left column chips `stake`, `withdraw` (stake color); right column `create_dispute`, `appeal`, `withdraw_fees` (fee color). Arrows draw via stroke-dashoffset, 400ms each, 60ms stagger. Each arrow terminates strictly on its own vault — no arrow bridges the two. *Viewer: every instruction touches exactly one mint's vault.*
3. **2.3–4.4 — Flow demo.** Particle pulses run in instruction order: `stake` (2 stake-coins in), `withdraw` (1 coin out), `create_dispute` (fee_paid grains in), `appeal` (bond grains in), `withdraw_fees` (grains out). Vault counters tick accordingly; the fee vault shows stacked sub-counters (`fee_paid`, `bonds`) beneath its balance. *Viewer: balances move only along these color-coded edges.*
4. **4.4–5.8 — Invariants seal.** The two equation boxes draw in: `stake_vault.balance == Σ JurorStake.staked` and `fee_vault.balance == Σ fee_paid + Σ fees_earned + Σ bonds`. Each side's Σ counts up in 400ms and lands equal; the `=` pulses once at 1.03 scale (240ms) with a small "✓ by construction" tag. *Viewer: the equations are identities the topology enforces.*
5. **5.8–7.2 — Audit glance, then seam.** A soft highlight ring hops stake_vault → left equation → fee_vault → right equation (240ms hops, 400ms dwells) while both vaults breathe at 1.01 scale. Crossfade out 6.9–7.2s (accelerate exit) into the beat-1 frame.

### Motion spec

- Durations: border trace 640ms; card settle-in 400ms; arrow draws 400ms; particle runs 480–640ms each; counter tweens 400ms; equation seal pulse 240ms; audit hops 240ms/dwell 400ms; seam crossfade 300ms.
- Easings: accord-settle `cubic-bezier(0.2,0,0,1)` everywhere except entrance settle-ins (emphasized `cubic-bezier(0.05,0.7,0.1,1)`) and the seam (accelerate `cubic-bezier(0.3,0,1,1)`).
- Stagger: vault cards 80ms; arrows 60ms (wave budget, <500ms total); equation sides 120ms.
- Layers — **Primary:** arrow draws + particle runs. **Secondary:** counter ticks, sub-counter stacks, equation seal pulse. **Ambient:** grid drift (counter-direction), vault breathing during beat 5.
- Load-bearing principles: **staging** (one vault system at a time, dimmed side while the other demos), **slow-in/slow-out** on arrow draws, **secondary action** (counters confirm each particle arrival), **timing** compression-free — deliberately even tempo says "nothing is hidden."
- 1/3 rules: max simultaneous movers = 2 chips + 1 particle stream (≤⅓ of elements); particle paths have a midpoint keyframe.

### Loop & interaction model

Seam: 300ms accelerate crossfade from the full tableau (beat-5 hold) to the empty-border frame — visually a "reset the demo" blink. Hover: pause + show instruction tooltips on chips (DOM, not part of the loop). No scrub needed.

### Reduced-motion fallback

Static final tableau: full container, both vaults with balances, all six arrows drawn in token colors, both equations boxed with the "✓ by construction" tag. Single SVG poster frame; identical to beat-5 hold.

### Implementation notes

**Vehicle: inline SVG + CSS keyframes** (stroke-dash draws, transform/opacity only) — auditors will screenshot and inspect it; DOM-native SVG stays crisp and printable with zero JS. Complexity **M**. Risks: equation text legibility at inline width — enforce min-width 720px viewport with graceful 2-column stacking below; counters must use tabular-nums to avoid reflow jitter.

---

## D2. Coherence settlement (slash is a ledger, not a transfer)

**Emotional target:** sober finality — the math settles quietly; nobody's hand reaches into the vault.
**Motion personality:** Corporate, with one Premium beat (the simultaneous conservation flash).

### Storyboard (7.6s loop)

Frame: settlement tableau. `stake_vault` top-left with a permanent "balance: N — unchanged" badge; juror cards sort into two columns; `withdraw_fees` door at the right edge; conservation strip at the bottom.

1. **0.0–1.1 — Sort.** Header chip "after `Final`" stamps in (scale 1.04→1.0, 400ms). Six juror cards enter center, then drift apart into columns — coherent (✓, left) vs incoherent (✗, right) — 600ms accord-settle, 60ms stagger, ≤40px travel. Each card carries its mini-ledger: `staked`, `fees_earned`. *Viewer: the panel is judged; two fates.*
2. **1.1–2.6 — Fees accrue on the ledger.** Three annotation chips arc gently over the coherent column and land as row annotations on `fees_earned`: `participation fees`, `forfeited appeal bonds`, `non-revealer fees` (fee-token color, 120ms arc staggers). The `fees_earned` counter counts up per landing. *Viewer: coherent Jurors' income is itemized — it's account state, not a transfer.*
3. **2.6–4.0 — The slash, as ledger math (hero nuance).** Incoherent cards: `staked` rows flash red (240ms) and tick **down** by `α·min_stake`. **Simultaneously** — not sequentially — coherent cards' `staked` rows flash green and tick **up**. A translucent annotation arc jumps column-to-column *above* the cards, labeled `α·min_stake` and explicitly tagged "ledger entry — not a transfer." The `stake_vault` does nothing but a 240ms 1.005 breath and its shield badge re-checks "unchanged." **No particle crosses the vault boundary at any point in the entire loop.** *Viewer: slashing redistributes claims on the vault; the vault itself never moves.*
4. **4.0–5.4 — The only exit door.** The `withdraw_fees` door at the right opens (240ms); a coherent juror's `fees_earned` converts to 3 fee-grains that flow fee_vault → door → wallet icon (640ms run, midpoint keyframe). The fee vault balance ticks down by the withdrawn amount. *Viewer: fee_token leaves the system through exactly one instruction.*
5. **5.4–6.6 — Conservation re-seal.** Bottom strip renders `stake_vault.balance == Σ JurorStake.staked`; both sides re-count with the post-slash numbers, land equal, `=` pulses once (echo of D1's seal).
6. **6.6–7.6 — Hold and seam.** 600ms hold on the settled tableau (ambient only), then 300ms accelerate crossfade to the beat-1 frame.

### Motion spec

- Durations: sort drift 600ms; annotation arcs 320ms each; slash flashes 240ms; counter ticks 400ms; door open 240ms; exit particle run 640ms; conservation recount 400ms/side; seam 300ms.
- Easings: accord-settle throughout; annotation arcs use emphasized `cubic-bezier(0.05,0.7,0.1,1)`; slash flash uses a fast-in/slow-out `cubic-bezier(0.4,0,0.2,1)` so the red reads as a state mark, not an explosion; seam accelerate.
- Stagger: card sort 60ms; annotation chips 120ms; slash flashes fire on all rows within one 80ms micro-cascade (simultaneity budget).
- Layers — **Primary:** the slash ledger event (row flashes + counter deltas). **Secondary:** annotation arcs, shield badge re-check, door mechanics. **Ambient:** column backdrop gradients breathing in opposite phase (counter-motion), vault 1.005 breath.
- Load-bearing principles: **staging** (vault badge is always lit, so the eye can verify "unchanged" during the slash), **secondary action** (arcs explain what the numbers just did), **timing** (the 80ms near-simultaneous cascade *is* the conservation law), **appeal** through restraint — the quietness is the trust cue.
- 1/3 rules: ≤4 cards in motion during sort (of 6 visible movers ≈ within budget); particle run has a keyframe at midpoint.

### Loop & interaction model

Seamless via 300ms crossfade; the tableau fully settles before the seam so the restart never reads as an interruption. Hover: pause + tooltip on the `α·min_stake` arc ("ledger entry — not a transfer") and on the shield badge. Optional GSAP scrub (drag) lets an auditor step through the slash frame-by-frame.

### Reduced-motion fallback

Static final tableau: two columns with settled ledgers (post-slash numbers), annotations in place, `α·min_stake` arc drawn with its "not a transfer" tag, vault badge "unchanged", `withdraw_fees` door shown open with a static dotted exit path, conservation strip sealed. Poster frame = beat-6 hold.

### Implementation notes

**Vehicle: inline SVG + GSAP timeline** — the simultaneous conservation cascade and per-row counters need a real timeline (and scrub for auditors); CSS keyframes get unwieldy at this coordination count. Complexity **M**. Risks: (1) any accidental vault-outflow particle would teach the wrong model — the spec forbids it; code review must check the vault's transform/opacity only. (2) Counter jitter without tabular-nums. (3) Six cards + annotations crowd below 640px — drop to 4 juror cards at small widths via media query.

---

## D3. The appeal ladder (exponential anti-bribery)

**Emotional target:** deterrence — the price of capture compounds faster than any prize.
**Motion personality:** Corporate with one theatrical Premium beat (the cost curve) — the drama is arithmetic, not decoration.

### Storyboard (8.0s loop)

Frame: a widening staircase descending left→right (step 1 top-left → step 4 bottom-right), each step holding its juror dots and a log-scale price chip; a dashed horizontal "value of capturing the ruling" line; caption cards at the bottom.

1. **0.0–0.8 — Step 1.** The first step (3 juror dots) rises from below and settles (400ms); price chip counts in: "3 Jurors · bond ×1 (B)". A 2-coin stack stands beside it. *Viewer: entry is cheap.*
2. **0.8–1.9 — Appeal #1.** Step 2 extends with 7 dots; entrance duration is ~30% shorter than step 1's; chip "7 Jurors · ×2 (2B)" lands with a 2px impact shake (120ms); coin stack doubles 2→4. *Viewer: each rung costs double the last.*
3. **1.9–2.8 — Appeal #2.** 15 dots; "×4 (4B)"; stack 8 coins; tempo compresses again. The dashed "value of capturing the ruling" line draws in (400ms) at a height the ladder is about to blow past.
4. **2.8–3.5 — Appeal #3.** 31 dots (rendered as a compact 31-dot grid); "×8 (8B)"; stack 16 coins. The beat arrives before the viewer is ready — that's the point.
5. **3.5–5.2 — The cost curve (hero beat).** A curve draws over the staircase: slow crawl then explosive rise — two segments: ease-in-cubic `cubic-bezier(0.32,0,0.67,0)` covering the first 30% of path in 60% of the time, then ease-out-expo `cubic-bezier(0.16,1,0.3,1)` rocketing through the remaining 70%. It crosses the dashed line with a flash ring + "✕" marker at the crossing, then exits frame top. *Viewer: bribing past this point costs more than the ruling is worth.*
6. **5.2–6.4 — The two exhaustion facts.** Caption cards flip in (240ms each, 160ms stagger): left — "appeal budget exhausted → **the ruling stands**" (gavel-settle icon); right — "appeal flips the ruling → **bond refunded**" with a 2-grain return stream looping wallet←appellant. On alternate loop iterations, the right card instead shows the forfeit path: bond grains pouring from the top step down into a "final coherent pool" basin. Parity flag alternates per loop.
7. **6.4–8.0 — Hold and seam.** Full ladder holds (coin stacks shimmer ambiently); 300ms crossfade resets to step 1 with parity flipped.

### Motion spec

- Durations: step entrances 400ms → 280ms → 200ms → 160ms (deliberate compression ratio ≈ 0.7× per step); chip slams 240ms; impact shakes 120ms; curve draw 1.7s total; caption flips 240ms; seam 300ms.
- Easings: entrances accord-settle; the curve is the only place the signature easing is deliberately broken — ease-in-cubic then ease-out-expo, because **the easing is the exponent**. Chip slams fast-in (`cubic-bezier(0.3,0,1,1)`) with zero overshoot + shake follow-through.
- Stagger: dots within a step 20ms micro-cascade; captions 160ms.
- Layers — **Primary:** the step sequence + cost curve. **Secondary:** price chips, coin-stack doublings, impact shakes, crossing flash. **Ambient:** stack shimmer, dashed-line slow drift, counter-motion grid.
- Load-bearing principles: **timing** (compression across beats *is* the exponential), **anticipation** (dashed prize line drawn one beat before the crossing), **follow-through/overlapping action** (chip shakes as stacks double), **exaggeration held at 0% overshoot** — scale and tempo carry the drama so the curve stays believable.
- 1/3 rules: one step in motion at a time; curve path gets keyframes at each step boundary (4 segments visually, 2 easing segments).

### Loop & interaction model

Seam: crossfade at 7.7–8.0s resets the ladder and flips the A/B parity flag (fail-path ↔ flip-path on the right caption), so consecutive loops differ by one card — replay value without a second animation. Hover: pause. Drag-to-scrub (GSAP): an integrator can park on the crossing point.

### Reduced-motion fallback

Static final ladder: all four steps (3/7/15/31 dots), log-scale price chips ×1→×8, coin stacks 2/4/8/16, the cost curve fully drawn crossing the dashed "value of capturing the ruling" line with the ✕ marker, both caption cards visible (fail + flip outcomes side by side). Poster frame = beat-7 hold.

### Implementation notes

**Vehicle: inline SVG + GSAP timeline** — the two-segment easing on one path draw and the A/B loop parity need timeline control CSS can't express cleanly. Complexity **M**. Risks: (1) exponential numbers unreadable at inline size — mitigate with the ×N multiplier chips and coin-stack doubling (countable, visceral) rather than long decimal balances; (2) the compression must stay legible — floor step entrance at 160ms; (3) curve/dashed-line crossing must be spatially unambiguous — put the crossing flash at ≥24px from any step edge.

---

## D4. Final-ruling retroactive coherence (multi-round settlement)

**Emotional target:** inevitable retroactive justice — no round escapes the final Ruling.
**Motion personality:** Corporate, with the backwards sweep as the single Premium moment.

### Storyboard (8.0s loop)

Frame: horizontal round timeline. Columns R1 (3 vote dots), R2 (7), R3 (15 compact grid), then a `final_ruling` slot at the far right; an `active_draws` counter above each round; a crank token below the rail.

1. **0.0–1.2 — Rounds lay out.** The rail draws left→right (640ms); round columns settle in with their dots, 120ms stagger. Dots are colored by **round-local** outcome: majority warm amber, minority neutral grey. The round-1 amber majority looks safe. The `final_ruling` slot at right is dashed and empty. *Viewer: each round once had its own winner.*
2. **1.2–2.0 — Finality stamps.** The ruling chip stamps into the final slot: scale 1.06→1.0, 400ms emphasized decelerate, stamp-shadow collapse beneath it. Slot border solidifies. *Viewer: there is exactly one ruling that matters — `dispute.final_ruling`.*
3. **2.0–3.8 — The retro-beam (hero beat).** A vertical beam at the final chip sweeps **right→left** — backwards over R3, R2, R1 (against reading direction: felt as time reversal). Leading edge bright, 120px trailing gradient. Each dot the edge passes recolors in a 120ms pop (scale 1.15→1.0): agrees with final → green (coherent); disagrees → red (incoherent). The round-1 bribed majority flips amber→red with the largest pop (1.2) plus a 160ms flash tick. The beam decelerates into R1 (ease-out over the final third of travel) so the earliest round gets the slowest, most damning reveal. *Viewer: coherence is judged against the final Ruling — early capture is retroactively slashed.*
4. **3.8–5.8 — Settle cranks walk forward.** The crank token walks **left→right** (forward in time, contrasting the beam). At each round: 240ms crank rotation (90°), a `settle_round ✓` chip lands, the round's `active_draws` counter ticks to 0, and lock badges release from the dots. Beside red/green dots, tiny ledger annotations appear — numbers only (`+fees_earned`, `staked −α·min_stake` per the D2 convention: no transfers, no vault outflows). *Viewer: settlement is cranked round by round, releasing every draw.*
5. **5.8–7.0 — Finality seal.** The whole rail pulses once (opacity 0.92→1, 400ms); a seal icon locks at the right; `active_draws: 0` confirmed above all rounds.
6. **7.0–8.0 — Seam.** 300ms crossfade back to the empty rail; next loop re-seeds dot placement with VRF-style jitter so rounds don't look hand-picked.

### Motion spec

- Durations: rail draw 640ms; column settles 400ms; ruling stamp 400ms; beam sweep 1.8s total; per-dot recolor pop 120ms; crank rotations 240ms; counter releases 400ms; rail pulse 400ms; seam 300ms.
- Easings: beam travel accord-settle overall with a terminal ease-out (`cubic-bezier(0.16,1,0.3,1)`) across the final third; dot pops emphasized fast (`cubic-bezier(0.05,0.7,0.1,1)`, 0% overshoot — pop via scale-in not bounce); cranks and chips accord-settle; seam accelerate.
- Stagger: columns 120ms; dots within a recolor pass 20ms micro-cascade trailing the beam edge by ≤60ms; crank stops 160ms apart.
- Layers — **Primary:** the backwards beam + recoloring dots. **Secondary:** crank walk, `active_draws` countdowns, settle chips, ledger annotations. **Ambient:** rail glow decay after the beam passes, counter-motion grid drift, VRF jitter on re-seed.
- Load-bearing principles: **staging** (beam owns the frame; cranks wait their turn), **slow-in/slow-out** (beam decelerating into R1), **secondary action** (annotations justify each recolor), **anticipation** (the empty dashed final slot in beat 1), and **directional contrast as choreography** — sweep backwards, settle forwards; the two directions are the concept.
- 1/3 rules: during the beam, the only movers are the beam edge + the dots it just passed (≤⅓ of dots active); the 15-dot round recolors as a grid micro-cascade, never all at once.

### Loop & interaction model

Seam: crossfade with VRF re-jitter of dot positions (deterministic seed list, cycles every 4 loops). Hover: pause + tooltip per round ("coherent 5 / incoherent 2 vs final_ruling"). Optional scrub: dragging the beam is the natural scrub affordance (GSAP progress maps 1:1 to beam position).

### Reduced-motion fallback

Static final timeline: rail with R1/R2/R3 fully recolored against the final ruling chip, the beam rendered as a static translucent band originating at the final slot and spanning back over all rounds, `settle_round ✓` chips and `active_draws: 0` counters in place, ledger annotations visible. Poster frame = beat-6 hold.

### Implementation notes

**Vehicle: inline SVG + GSAP timeline** — the beam-position↔recolor coupling and the scrub affordance need timeline mapping of animation progress to beam x-position. Complexity **M** (many small elements, but every mover is a simple transform/fill). Risks: (1) 25 total dots at small widths — the R3 grid must stay ≥6px per dot or collapse to a proportional bar; (2) the beam direction must never be flipped in RTL locales — lock direction or mirror the whole timeline; (3) recolor timing drift from beam edge would break the cause-effect read — drive recolors from the beam's timeline position, not independent delays.

---

## D5. The juror's capital journey (`active_draws` lock, two-phase withdraw)

**Emotional target:** patient clarity — "your capital is safe, just committed" — the padlock is honest about why.
**Motion personality:** Corporate; the shackle opening is the group's slowest Premium beat.

### Storyboard (8.0s loop)

Frame: horizontal airlock strip, five stations left→right: **stake in** (wallet + accumulator leaf-row) → **drawn** (capital stack + padlock + lane gate) → **disputes terminal** (round chips) → **request_withdraw** (inner door + `pending_withdrawal` cell) → **withdraw** (outer door + wallet). One juror's tokens traverse the strip.

1. **0.0–1.2 — Stake in, leaf appended.** The wallet emits 4 stake-coins that stream into a new leaf cell sliding into the accumulator leaf-row (240ms slide, accord-settle); the accumulator root sum ticks +S (400ms). *Viewer: staking makes you a leaf with weight.*
2. **1.2–2.6 — Drawn: the lock.** A VRF sparkle scatters jitter onto the leaf (240ms random-stagger points) and lands; the leaf's capital stack slides right to station 2; a **padlock drops onto the stack** — rigid settle: 640ms, 0% overshoot, 2px vertical shake as follow-through (120ms); `active_draws: 1` ticks up; the lane gate beneath closes. *Viewer: being drawn freezes this capital.*
3. **2.6–3.4 — "Why can't I unstake right now?"** One coin nudges the gate (160ms ease-out); the gate edge flashes red (120ms); the coin bounces back ~60% of its approach and settles (240ms); caption fades in/out: "capital committed while drawn". *Viewer: the lock is a rule, not a delay bug.*
4. **3.4–4.6 — Terminal: the shackle opens (hero beat).** The drawn Dispute chip at station 3 stamps "Final ✓" (400ms); `active_draws` ticks 1→0; the **shackle lifts** — rotate −28° + rise 6px, 640ms gentle decelerate, 0% overshoot, faint highlight ring expanding 12px and fading. Caption: "every drawn dispute terminal". *Viewer: the lock opens only when nothing is still drawn.*
5. **4.6–5.8 — request_withdraw: banked, not out.** The **inner** airlock door opens (240ms); the leaf cell's weight flips to 0 (card-flip, 240ms — a ledger flip, not a disappearance); coins move leaf → `pending_withdrawal` cell (480ms, internal annotation "banked"). The **outer** door stays closed. Caption: "funds banked to `pending_withdrawal`". *Viewer: phase one of withdraw is an internal banking step.*
6. **5.8–7.0 — withdraw: SPL out.** The **outer** door opens (240ms); the coins stream out to the wallet with an SPL token badge (640ms, midpoint keyframe); the wallet balance counter lands with a tabular tick. Inner and outer doors are never open in the same beat — the airlock invariant, visually enforced. *Viewer: only `withdraw` puts SPL back in your wallet.*
7. **7.0–8.0 — Reset.** The emptied leaf cell slides out of the leaf-row; a ghosted padlock re-materializes at station 2 for the next juror; 300ms crossfade to beat 1.

### Motion spec

- Durations: coin streams 480–640ms; leaf slide 240ms; padlock drop 640ms + 120ms shake; gate nudge 160ms / bounce-back 240ms; shackle open 640ms; door opens 240ms; ledger flip 240ms; counters 400ms; captions 240ms in/out; seam 300ms.
- Easings: accord-settle for nearly everything; padlock drop uses a rigid fast-in `cubic-bezier(0.3,0,1,1)` into a hard stop (metal: 1.2× duration, 0% overshoot); shackle open uses gentle `cubic-bezier(0.4,0,0.2,1)` — the softest curve in Group D, spent on the single most satisfying moment; coin bounce-back ease-out with 0% overshoot (it's refused, not playful); VRF jitter is staggered opacity/scale pops (20ms), not motion blur.
- Stagger: coins in a stream 40ms; VRF sparkle points 20ms; station captions trail their station's event by 160ms.
- Layers — **Primary:** the coin stream + the padlock's two states. **Secondary:** leaf-row insertion, ledger flips, door mechanics, counters. **Ambient:** accumulator grid breathing behind the leaf-row, ghost-padlock flicker at reset, wallet glow on landing.
- Load-bearing principles: **anticipation** (the gate-nudge beat makes the lock legible before it opens), **follow-through** (padlock shake, wallet glow), **staging** (one station live at a time; future stations dimmed to 60%), **slow-in/slow-out** on the shackle (the pause before release is the trust), **secondary action** (counters and flips confirm each state change).
- 1/3 rules: coins travel station-to-station with a midpoint keyframe; only one station's elements move at a time; strip is 5 stations so no mover crosses >⅓ width unkeyframed.

### Loop & interaction model

Seam: the emptied-leaf + ghost-padlock reset gives a diegetic reason for the loop to restart (the next juror's journey), then a 300ms crossfade cleans residual state. Hover: pause. Drag-to-scrub: the strip maps 1:1 to timeline progress — scrubbing back re-locks the shackle, which is genuinely instructive; station labels are DOM captions outside the scrubbed SVG for accessibility.

### Reduced-motion fallback

Three-keyframe crossfade (2s per frame, 400ms crossfades): **frame 1** — staked leaf + padlock closed + `active_draws: 1` + gate closed (the "not right now" state); **frame 2** — Dispute terminal, shackle open, `active_draws: 0`; **frame 3** — leaf weight 0, `pending_withdrawal` banked, SPL out at the wallet. If the docs pipeline prefers a single frame: a labeled 5-station static strip with the padlock shown closed at station 2 and open at station 4. Crossfade variant recommended — the journey needs sequence.

### Implementation notes

**Vehicle: inline SVG + GSAP timeline** — the longest pipeline in the group (5 stations, two doors, one lock with a scrub-driven state) needs a master timeline; Lottie is a valid alternative if a motion designer will hand-tune, at the cost of the scrub affordance. Complexity **L**. Risks: (1) crowding at inline width — design at 16:9 ≥ 800px; below 640px collapse to the 3-keyframe reduced-motion crossfade; (2) door/lock state bugs on scrub reversal — drive door open-states from timeline progress thresholds, not toggles; (3) the hero shackle must read at 24px tall minimum or the emotional beat is lost.

---

## Cross-contract notes for the family merge

- D1's invariant seal, D2's conservation re-seal, and D4's finality seal share one animation (the `=`/✓ pulse) — keep them byte-identical so the docs site reads them as one system.
- D2's slash convention is normative for D4's ledger annotations: slashes are row flashes and number deltas, never vault outflows.
- Token particle materials (stake-coin vs fee-grain) and the accord-settle easing are defined once in the group preamble and must not be re-tuned per illustration.
