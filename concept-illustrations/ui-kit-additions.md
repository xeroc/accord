# UI kit additions — the concept-illustration vocabulary

Single source of truth for the `@useaccord/ui` mechanism components added for
the six concept-illustration videos (groups A–F). Everything here is exported
from `@useaccord/ui`; everything obeys the **frame contract**.

## The frame contract (law)

Every component is a pure function of an explicit `frame` prop. No Remotion
imports, no hooks, no wall clock, no `setTimeout` inside the kit. The caller
owns time:

- **Remotion:** `frame={useCurrentFrame()}` (30 fps — the durations below assume it).
- **Browser:** `const frame = useWallClockFrame({ fps: 30, loopFrames: N })`.

Frame ↔ time cheat sheet (30 fps): 60 ms = 2 f · 100 ms = 3 f · 240 ms ≈ 7 f ·
400 ms = 12 f · 500 ms = 15 f · 640 ms ≈ 19 f · 1 s = 30 f.

Conventions shared by all of them:

- **Tokens only** — colors come exclusively from Tailwind classes
  (`bg-raised`, `bg-amber`, `text-text-secondary`, `border-border-subtle`,
  `font-mono`, `bg-nearwhite/…`, `text-confirm`, `text-slash`, …). Never a
  literal hex; the only raw values in `style` are geometry and
  `var(--accord-amber)` glow shadows (house precedent).
- **Test seams** — stable `data-*` attributes (`data-cell`, `data-internal`,
  `data-dot`, `data-seg`, `data-leaf`, `data-node`, …) so scenes can query
  them and the kit tests stay behavioral.
- **Dim through color, never text opacity** — "dim baseline" states use
  `text-muted-foreground` + `bg-raised/40` at full opacity. Multiplicative
  opacity on text fails WCAG contrast (the Storybook axe suite enforces it).
- Most "before its frame" states render at `opacity: 0` (layout-stable,
  `RulingStamp` precedent), not absent.

---

## New components

### `TokenTone` / `TokenBadge` — the two-mint color convention

`import { TokenBadge, TOKEN_TONE, type TokenTone } from "@useaccord/ui";`

The formal stake-vs-fee mapping (Group D's `--tok-stake` / `--tok-fee`):
**stake = cool nearwhite (slate), fee = warm Verdict Amber.** Every
token-carrying surface (VaultBox, particles, chips, badges) resolves its
colors through this one map so the two mints never drift apart.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `frame` | `number` | — | drives the pop-in |
| `tone` | `"stake" \| "fee"` | — | picks the mint colors |
| `amount` | `number \| string` | — | mono, tabular when numeric |
| `label` | `string` | — | unit label after the amount ("fee", "bond") |
| `at` | `number` | `0` | frame the badge pops in (8 f settle) |
| `className` | `string` | — | sizing/layout overrides |

`TOKEN_TONE: Record<TokenTone, { text, bg, border, dot }>` — the raw class map
(`stake` → `text-nearwhite`/`bg-nearwhite/10`/`border-nearwhite/40`/`bg-nearwhite`;
`fee` → the amber equivalents). Use it directly when composing particles or
custom chips.

```tsx
<TokenBadge frame={frame} tone="fee" amount={25} label="fee" at={120} />
```

**Groups:** A (stake beats), C (stakes), D (all), E, F (fees/refunds).

---

### `ChainStrip` — the on-chain ledger strip

`import { ChainStrip } from "@useaccord/ui";`

Muted blocky cells appending left→right, hairline links drawing between them,
one highlighted hash cell that breathes and can pulse once, an optional
shimmer sweep, and glyph-by-glyph label typing.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `frame` | `number` | — | |
| `cells` | `readonly string[]` | — | slot labels, in order (sigils or truncated hex) |
| `at` | `number` | `0` | frame the first cell appends |
| `stagger` | `number` | `8` | frames between appends |
| `appendAt` | `(i: number) => number` | `at + i·stagger` | per-cell append frame (e.g. a slot landing with an event beat) |
| `highlight` | `number` | — | index of the hash cell |
| `highlightAt` | `number` | with append | frame the highlight ignites |
| `pulseAt` | `number` | — | one-shot scale pulse on the highlighted cell |
| `shimmerAt` | `number` | — | frame a shimmer band crosses L→R (20 f) |
| `typePerChar` | `number` | `0` | frames per glyph while typing on (0 = instant) |
| `cellWidth` | `number` | `84` | px |
| `height` | `number` | `44` | px |
| `className` | `string` | — | |

```tsx
<ChainStrip
  frame={frame}
  cells={["slot 0", "a3f9c2d1", "slot 2"]}
  appendAt={(i) => (i === 1 ? 132 : i * 10)}   // the hash lands with the event
  highlight={1}
  highlightAt={136}
  typePerChar={2}
  pulseAt={190}
/>
```

**Groups:** A1 (boundary ledger), B2 (sealed-envelope landings), E1 (the
32-byte hash cell), E2 (`evidence_hashes[]` film strip).

---

### `SubaccordCard` — the owned-state container

`import { SubaccordCard, SUBACCORD_INTERNALS } from "@useaccord/ui";`

The expanded card settles in, then cascades its internals (fade + 6 px
settle-rise, `stagger` apart) — "a Subaccord owns exactly these things." The
collapsed variant is the dimmed background chorus ("many, permissionless"):
offset ghost layers, no internals, muted classes.

`SUBACCORD_INTERNALS` — the canonical five rows: `stake vault`, `fee vault`,
`accumulator root`, `evidence operator`, `authority`. Pass it; don't retype it.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `frame` | `number` | — | |
| `title` | `string` | — | e.g. `"Subaccord A"` |
| `at` | `number` | `0` | frame the card settles in (15 f) |
| `internals` | `readonly { label: string; value?: string }[]` | — | text rows to cascade |
| `internalsAt` | `number` | `at + 6` | frame the cascade starts |
| `stagger` | `number` | `2` | frames between rows (60 ms) |
| `collapsed` | `boolean` | `false` | dimmed stack variant, no internals |
| `className` | `string` | — | |
| `children` | `ReactNode` | — | composed interiors (see below) |

```tsx
<SubaccordCard frame={frame} title="Subaccord A" internals={SUBACCORD_INTERNALS} />
```

Composing richer interiors (D1's vault boxes): pass `children` and offset each
child's own `at` by the cascade — `<VaultBox at={at + 6 + i * 2} … />`.

**Groups:** A1 (hero + collapsed B/C/⋮ stack), D1 (container), D2 (settlement
tableau), F7 (trust map nodes).

---

### `VaultBox` — a mint vault

`import { VaultBox } from "@useaccord/ui";`

Visually static, solid-bodied container (Group D law: stillness is the
message). Its only life: a ≤0.5 % breath, a tabular balance count-up with a
post-tick brightness flash, stacked sub-counters, and the "unchanged" shield
badge. No particle ever leaves a vault — that convention lives in the scenes.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `frame` | `number` | — | |
| `label` | `string` | — | `"stake_vault"` / `"fee_vault"` |
| `token` | `TokenTone` | — | which mint — picks TOKEN_TONE colors |
| `balance` | `number` | — | current (post-tick) balance |
| `from` | `number` | `balance` | pre-tick balance; omit for static |
| `at` | `number` | `0` | frame the card settles in (12 f, from above) |
| `tickAt` | `number` | `at` | frame the balance ticks |
| `tickDur` | `number` | `12` | count-up length (≈400 ms) |
| `subCounters` | `readonly { label: string; value: number }[]` | — | stacked rows (`fee_paid`, `bonds`) |
| `unchangedAt` | `number` | — | frame the "unchanged" badge (re-)checks |
| `className` | `string` | — | |

```tsx
<VaultBox
  frame={frame}
  label="stake_vault"
  token="stake"
  from={1000}
  balance={1020}
  tickAt={164}
  unchangedAt={210}
/>
```

**Groups:** D1 (two mints), D2 (unchanged through the slash), D5 (capital
stack station), F4 (prune/withdraw mirroring).

---

### `LedgerCounter` — ledger row with count-up + row flash

`import { LedgerCounter, type LedgerTone } from "@useaccord/ui";`

The slash convention, formalized: number changes are row flashes + count
deltas, never transfers. Mono label + tabular value; on `at` the value counts
`from → to` while a tone wash pops and decays (8 f).

| Prop | Type | Default | Notes |
|---|---|---|---|
| `frame` | `number` | — | |
| `label` | `string` | — | `"staked"`, `"fees_earned"`, `"active_draws"` … |
| `to` | `number` | — | post-change value |
| `from` | `number` | `to` | pre-change value; omit for a static row |
| `at` | `number` | `0` | frame the change fires |
| `dur` | `number` | `12` | count length (≈400 ms) |
| `tone` | `"confirm" \| "slash" \| "amber" \| "neutral"` | `"neutral"` | value color + flash wash |
| `flash` | `boolean` | `true` | row flash on change |
| `className` | `string` | — | |

```tsx
<LedgerCounter frame={frame} label="staked" from={100} to={60} at={180} tone="slash" />
```

**Groups:** D2 (juror mini-ledgers), D4 (settle annotations, `active_draws`),
D5 (root sum / wallet balance), F4 (root-sum counts).

---

### `PanelLadder` — the appeal ladder 3→7→15→31

`import { PanelLadder, PANEL_LADDER } from "@useaccord/ui";`

Bottom-aligned steps of growing dot clusters (`PANEL_LADDER = [3, 7, 15, 31]`,
dots grid 3-in-a-row / 4-col / 8-col). Each step rises with an entrance that
compresses ~0.7× per rung — the tempo **is** the exponent; dots micro-cascade
(≤6 f) inside their step; optional bond-price chips land beneath.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `frame` | `number` | — | |
| `steps` | `readonly number[]` | `[3, 7, 15, 31]` | dots per step, L→R |
| `at` | `number` | `0` | frame step 0 rises |
| `stagger` | `number` | `26` | frames between step onsets (≈0.9 s) |
| `labels` | `readonly string[]` | — | chips under steps (`"×1 (B)"` … `"×8 (8B)"`) |
| `stepHeight` | `number` | `46` | px per rung (step *i* is (*i*+1)·stepHeight tall) |
| `dotSize` | `number` | `8` | px |
| `className` | `string` | — | |

```tsx
<PanelLadder frame={frame} labels={["×1 (B)", "×2 (2B)", "×4 (4B)", "×8 (8B)"]} />
```

**Groups:** B1 (the `3→7` appeal badge), D3 (the ladder + cost curve), E2
(ladder under the film strip), F1 (panel(r) dot clusters in the grid).

---

### `StateNode` — a lifecycle station

`import { StateNode } from "@useaccord/ui";`

One station of a rail (B1's state machine, F2's spine). Rests at the **dim
baseline** (muted classes — dim through color, never text opacity); **ignites**
at `activeAt` (amber pill + glow + expanding ring ripple, zero overshoot);
**relaxes** at `settleAt` to `"visited"` (calm, confirm-tinted) or
`"baseline"` (the loop-seam reset).

| Prop | Type | Default | Notes |
|---|---|---|---|
| `frame` | `number` | — | |
| `label` | `string` | — | `"Created"`, `"Filed"`, … |
| `at` | `number` | `0` | frame it enters the diagram |
| `activeAt` | `number` | — | frame it ignites (ring + glow) |
| `settleAt` | `number` | — | frame it relaxes out of active |
| `settleTo` | `"visited" \| "baseline"` | `"visited"` | relax target |
| `className` | `string` | — | |

```tsx
<StateNode frame={frame} label="Reveal" at={48} activeAt={108} settleAt={129} />
```

**Groups:** B1 (the whole lifecycle rail), F2 (Filed → … → Finalized spine),
F6 (filing snapshots), E2 (round steps, subdued).

---

### `MerkleSumTree` — the MST accumulator

`import { MerkleSumTree } from "@useaccord/ui";`

Leaves are stake-weighted bars (width ∝ stake, values shown beneath when
≤ 8 leaves), internal nodes plain dots, root on top. An update ripples up the
ancestor path in **discrete hops** (one `hopDur` per hop — hashing is
discrete, each hop lands before the next begins); off-path nodes frost out
(65 % dim on the bar fill only); zeroed leaves drain hollow with a "0". The
updated leaf's stake odometers during hop 0; `resetAt` crossfades back to
neutral for the loop seam.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `frame` | `number` | — | |
| `leaves` | `readonly number[]` | — | stake weights; bar widths ∝ values |
| `at` | `number` | `0` | tree draws root-first, one level per 6 f |
| `updateLeaf` | `number` | — | leaf index whose update ripples up |
| `updateAt` | `number` | — | frame hop 0 (the leaf) fires |
| `updateTo` | `number` | — | post-update stake (odometers during hop 0) |
| `hopDur` | `number` | `15` | frames per hop (≈500 ms cadence) |
| `frostAt` | `number` | `updateAt` | frame off-path nodes frost out |
| `resetAt` | `number` | — | frame the scene crossfades to neutral |
| `zeroed` | `readonly number[]` | — | leaf indices rendered hollow |
| `zeroAt` | `number` | — | frame they drain (omit = already hollow) |
| `leafLabels` | `readonly string[]` | — | labels under bars (suppresses stake numbers) |
| `rootLabel` | `string` | — | annotation under the root once drawn |
| `width` | `number` | `440` | px |
| `height` | `number` | `260` | px |
| `className` | `string` | — | |

```tsx
<MerkleSumTree
  frame={frame}
  leaves={[120, 80, 140, 60, 200, 160, 90, 150]}
  updateLeaf={3}
  updateAt={66}
  updateTo={100}
  frostAt={66}
  rootLabel="root · 45 B"
/>
```

Path math: for 8 leaves the path is 4 nodes (leaf → L2 → L1 → root); hop *k*
fires at `updateAt + k·hopDur` and the root lands on the final hop — keep the
"root ticks after the last hop" follow-through by placing any root-counter
`LedgerCounter` at `updateAt + (depth)·hopDur`.

**Groups:** C2 (the ripple + on-chain root), F4 (prune → hollow leaf), D5
(accumulator leaf-row), A1 (accumulator root internals).

---

### `SortitionRuler` — the number line [0, total_stake)

`import { SortitionRuler } from "@useaccord/ui";`

Stake-proportional segments whose widths ARE the probability mass, `0` /
`total_stake` endpoint labels, an optional density wave (bars bump as it
passes), darts that fly a shallow arc and land at `r` with a
drop-needle plus a round end marker, winner amber tint sweeps, and the diagonal-hatch
"drawn — excluded" state. **The ruler never reshapes** — a collision
re-derives the next dart, never the widths. The single-dart/winner/hatch
props cover one draw; the plural `darts`/`wins`/`hatches` props play the
full C1 story (pinned throw → collision dissolve → re-derived throw,
two winner tints, per-segment hatch beats) on one ruler — classic props
normalize into them, so both styles compose.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `frame` | `number` | — | |
| `stakes` | `readonly number[]` | — | segment widths ∝ values |
| `labels` | `readonly string[]` | — | juror labels above segments |
| `at` | `number` | `0` | baseline draws; segments cascade (2 f apart) |
| `sweepAt` | `number` | — | frame the density wave crosses (17 f, linear) |
| `dartR` | `number` | — | landing point in stake units |
| `dartAt` | `number` | — | frame the dart lands (settle + needle) |
| `throwFrom` | `number` | — | departure point in stake units (draws the arc) |
| `throwAt` | `number` | `dartAt − 10` | frame the throw departs |
| `winner` | `number` | — | winning segment index (tint sweep) |
| `winAt` | `number` | `dartAt + 4` | frame the sweep runs |
| `drawn` | `readonly number[]` | — | excluded segment indices (hatch) |
| `drawnAt` | `number` | — | frame the hatches wipe on (8 f) |
| `darts` | `readonly SortitionDart[]` | — | extra darts: `{ r, from?, pinAt?, throwAt, landAt, dissolveAt? }` |
| `wins` | `readonly { seg, at }[]` | — | extra winner tint sweeps (tints persist — the win record) |
| `hatches` | `readonly { seg, at }[]` | — | extra hatches, each on its own beat |
| `width` | `number` | `520` | px |
| `height` | `number` | `102` | box height — baseline at the bottom, headroom for labels + dart |
| `className` | `string` | — | |

```tsx
<SortitionRuler
  frame={frame}
  stakes={[120, 80, 450, 250, 100]}
  labels={["P", "Q", "R", "S", "T"]}
  dartR={290}
  dartAt={70}
  throwFrom={0}
  winner={2}
  winAt={74}
  drawn={[2]}
  drawnAt={110}
/>
```

**Groups:** C1 (the whole draw), C3 (the mini-ruler callback under window A),
A1 (stake-proportional slices).

---

## Video extractions — composed animations

Whole beats lifted out of the finished videos so the app and landing
can replay them on their own clock. Same frame contract as everything
above: pure functions of `frame`, tokens only, `data-*` test seams.

### `AppealCostCurve` — the ladder's hero beat (economics D3)

`import { AppealCostCurve } from "@useaccord/ui";`

The exponential cost curve drawing over the `PanelLadder` staircase —
slow crawl, explosive rise (the two-segment easing IS the exponent) —
crossing the dashed "value of capturing the ruling" line with a flash
and ✕, then exiting the top. Fixed 560×500 box that frames the curve —
baseline (the ladder's floor) at local y = 470, curve peak at y = 30.
Pair with a default `PanelLadder` placed at `left: 88`, floor on the baseline.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `frame` | `number` | — | |
| `at` | `number` | `0` | frame the curve starts drawing |
| `dur` | `number` | `51` | draw length (the D3 tempo) |
| `dashAt` | `number` | `at − 50` | frame the prize line draws L→R (12 f) |
| `labelAt` | `number` | `dashAt + 10` | frame the prize label settles |
| `prizeLabel` | `string` | `"value of capturing the ruling"` | caption |
| `className` | `string` | — | sizing overrides (box is 560×500) |

### `RetroBeam` — the final ruling reaches back (economics D4)

`import { RetroBeam } from "@useaccord/ui";`

A horizontal round rail: rounds' votes start colored by option (YES
amber, NO grey), the final ruling stamps into its slot at the right,
then the beam sweeps right→left — decelerating into the earliest round
— and dots recolor AS THE BEAM PASSES (with-final → confirm, against →
slash, one pop at the edge). Once a round is fully passed, its slashed
jurors' stake moves to the coherent ones: each slashed dot emits a
stake particle that arcs to a coherent juror of the same round — the
slashed dot shrinks and dims, the receiver pops and stays grown. Dot
jitter is seeded (`seededRandom`, byte-identical to Remotion's
`random`), keyed by round id.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `frame` | `number` | — | |
| `rounds` | `readonly { id?, yes, no }[]` | — | rounds left→right |
| `finalRuling` | `"yes" \| "no"` | — | what coherence is judged against |
| `at` | `number` | `0` | rail draws in (19 f) |
| `beamFrom` / `beamTo` | `number` | `66` / `126` | beam departure / clear |
| `rulingAt` | `number` | `46` | stamp lands in the slot |
| `redistribute` | `boolean` | `true` | slashed→coherent stake particles per round |
| `spotlight` | `{ round, side }` | — | the bribed emphasis — bigger dots, bigger pop |
| `width` / `height` | `number` | `1300` / `370` | box size |
| `className` | `string` | — | |

Scene overlays (D2-convention counters, round-local tallies, settle
chips) stay scene-local — position them off `centers`.

### `DrawCommitReveal` — the mechanism pipeline (accord-30s)

`import { DrawCommitReveal } from "@useaccord/ui";`

The intro's right column as one piece: `JurorPool` (three jurors
popping out of the staked grid) → `SealedVote`×3 (hashes scramble in
and lock, the reveal flips them to votes) → `RulingStamp`. Defaults
reproduce the intro beat exactly; every timing is a prop.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `frame` | `number` | — | |
| `poolCount` / `poolCols` / `dotSize` | `number` | `30` / `5` / `12` | the pool grid |
| `drawn` | `readonly { dot, at }[]` | the intro trio | which dots pop amber |
| `jurors` | `readonly { hash, vote, commitAt, revealAt }[]` | the intro trio | the jury |
| `rulingAt` / `rulingText` / `rulingDur` | — | `175` / `"RULING: YES"` / `7` | the stamp |
| `width` | `number` | `620` | column width |
| `className` | `string` | — | |

### `DisputeFlow` — a ruling about the real world (accord-30s)

`import { DisputeFlow } from "@useaccord/ui";`

The unlock diagram: dispute block → wire with a traveling amber pulse →
the court block scaling in → second pulsed wire → ruling block, then
the consumer chips fanning out underneath. Pulses loop on the frame
counter — browser walls clock it via `useWallClockFrame`.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `frame` | `number` | — | |
| `at` | `number` | `0` | source block enters; court `+6`, ruling `+12` |
| `sourceLabel`/`sourceValue`, `courtLabel`/`courtSub`, `rulingLabel`/`rulingValue` | `string` | intro copy | block text |
| `consumers` | `readonly string[]` | the intro four | fan-out chips |
| `consumersAt` | `number` | `at + 57` | first chip; stagger 5 f |
| `wireFrames` / `wireOffset` | `number` | `45` / `22` | pulse loop / 2nd-wire phase |
| `wireWidth` | `number` | `200` | px |
| `className` | `string` | — | |

---

## Deliberately NOT in the kit (build scene-locally)

Single-scene staging stays out per the reuse rule: **PayoffMatrix** (A2's
2×2 game-theory grid), **Padlock/airlock doors** (D5), **CoherenceBand**
number-line band (F5 — pair `SortitionRuler`-style geometry with scene
logic), the C3 sequence-diagram lanes, and the F1 grid walker. Compose them
from `MonoChip`, `TokenBadge`, `StateNode`, and the kit pieces above.

## Pre-existing kit exports (prefer these)

- `AccordMark` — the 3-line house mark; one geometry everywhere
  (`src/brand/accord-mark`). Never redraw it.
- `Wordmark` — the Accord wordmark lockup piece (`src/brand/wordmark`).
- `AmberRule` — the amber progress rule (0→1), static-capable
  (`src/brand/amber-rule`; prop `enter?: number`).
- `Backdrop` — the ambient canvas (ledger grid · juror field · verdict glow ·
  vignette); seeded PRNG matches Remotion's `random()`.
- `JurorPool` — the staked pool as a dot grid; `drawnAt(dot)` pops jurors
  Verdict Amber; `fadeAt` retires the pool.
- `SealedVote` — commit→reveal slot: hash scrambles/locks, flips to the vote,
  optional coherent/incoherent tone + cross-out.
- `RulingStamp` — the verdict landing: bordered amber mono text slamming in
  from 1.6× with glow. The hero moment.
- `MonoChip` / `DeltaChip` (`ChipTone: "amber" | "confirm" | "slash" | "neutral"`) —
  the mono pill vocabulary; `DeltaChip` for +/− amount pops (caller-owned
  `pop`, 0→1).
- `TallyBar` — the post-reveal vote count assembling (amber majority +
  muted minority + mono counts).
- `useWallClockFrame({ fps?, loopFrames? })` — the browser-side twin of
  `useCurrentFrame()`; freezes for `prefers-reduced-motion`.

### Which color vocabulary when

Three orthogonal tone systems — don't mix them up:

1. **`TokenTone`** (`stake` | `fee`) — *which mint* is moving (nearwhite vs amber).
2. **`ChipTone`** (`amber` | `confirm` | `slash` | `neutral`) — mono pill
   *emphasis* for labels and deltas (`MonoChip`/`DeltaChip`).
3. **`LedgerTone`** (`confirm` | `slash` | `amber` | `neutral`) — *what
   happened* to a ledger row (earned / slashed / pending).

State colors are fixed semantics: amber = pending/identity accent,
confirm = coherent/earned/final, slash = slashed/incoherent (firm, never a
shake), muted greys = chrome and dim baselines.
