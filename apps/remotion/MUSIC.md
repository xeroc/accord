---
version: alpha
name: Passive Pulse — Accord Project video score house style
purpose: soundtrack
key: per family — accord: Db major · canon: Eb major · synod: Bb minor
bpm: 120
timeSignature: 4/4
structure: fixed
duration: 30–90 s, set per video by its scene map
palette:
  pulse: bd (RolandTR909 bank)
  tick: hh
  wood: rim
  arp: piano
  pad: triangle
  marker: piano
  hum: piano
  bloom: piano
  accent: pluck (canon — VCSL concert harp, registered by src/cli/score.ts) · moog (synod)
families:
  accord: { key: Db major, accent: none }
  canon: { key: Eb major, accent: pluck }
  synod: { key: Bb minor, accent: moog }
references:
  - "audio/accord-intro-30s.strudel — the canonical implementation of this entire brief; read it before composing anything"
---

## Overview

The house sound of every Accord Project explainer video: a soft-heel 909 pulse under hushed piano arpeggios — warm ninth-chords, a triangle pad for a floor, a kick that ticks like a metronome with good taste, and single piano notes that land on cuts the way a period lands on a sentence. It scores 30–90 s muted-first explainers (Accord, Canon, Synod) for X/Twitter: all copy is on-screen, there is no voice-over, and the music is the only audio lane — yet it must still lose every attention contest to the reading. The viewer should feel the beat at transitions without ever noticing the music working. This file is a family brief: each video's `.strudel` score is an instance of it — different key or accents per product family, same blood.

## Sound Palette

Top to bottom, the ends define the width. The top voice is a sparse piano hum — single notes in octave 5, one per bar at most, more often one per section — plus marker notes (see Form) that punctuate storyboard beats. The middle is the harmonic engine: piano arpeggios in octaves 3–4, three to four notes per bar, always touching the chord's color tones (9th, 7th) more than its root. The bottom is a triangle pad rooted in octave 2 — round, subby, slightly detuned by slow FM — carrying the chord's floor. Percussion is furniture, not a drummer: 909 kick on beats 1 and 3 only, whisper hats high-passed into the 9 kHz mist, one wooden rim tick per bar. Family accents: Canon videos may swap the piano hum lane for an LPF'd pluck (same gain, same room); Synod videos for a moog voice filtered dark (LPF ≤ 1200). One accent lane per video — it replaces the hum, never stacks on it. Accord videos carry no accent: piano only.

## Harmony

Chord vocabulary is ninths and suspensions only — maj9, m9, 7sus — shell voicings may omit the 3rd; triads sound naked and banned. No strong dominant→tonic resolution anywhere: the V, when it appears at all, is a 7sus that refuses to resolve. One chord per bar (2 s), harmonic rhythm never faster. Voice-lead by common tones between adjacent chords; the top voice moves least. Flat spellings throughout — every family key lives on the flat side so the warmth registers as kinship.

- **accord — Db major** (home): Imaj9 – vi m9 – IVmaj9 – V7sus, i.e. Dbmaj9 · Bbm9 · Gbmaj9 · Ab7sus. The intro's exact loop.
- **canon — Eb major** (a step brighter, retail-facing): Imaj9 – vi m9 – IVmaj9 – iii m7 — Ebmaj9 · Cm9 · Abmaj9 · Gm7. Dominantless by construction.
- **synod — Bb minor** (graver — N-party escrow): i9 – VImaj7 – iv9 – VII, i.e. Bbm9 · Gbmaj7 · Ebm9 · Ab. The VII is a modal door, not a dominant.

## Rhythm & Feel

120 BPM, 4/4, `setcpm(30)` — chosen for frame math as much as feel: 1 beat = 0.5 s = 15 frames @30 fps; 1 bar = 2.000 s = 60 frames. Every scene map converts to bars by dividing seconds by two. Feel is "passive pulse": kick on 1 and 3, never four-on-the-floor unless a scene explicitly asks for drive; hats are a whisper (gain ≤ .1, hpf 9000); one rim per bar, placed on 3 or the and-of-2. Density ceiling: the bed is at most 3 pitched lanes (arp, pad, hum) + 3 percussion lanes; markers add at most one lane and at most two events per bar. No fills. No ghost-note showers. No swing.

## Form

Fixed per video — the score is a `cat()` of bar-long stacks, one per bar of the video, arranged to the video's scene map. Workflow: read `videos/<id>/index.tsx` (scene docblock) or `scenes/timeline.ts` → convert frame boundaries and named beats to seconds (÷30) → to bars (÷2) → quantize each named beat to the nearest 1/16 (0.125 s), preferring on-beat when the storyboard allows → compose the bed as a bar-per-chord loop with per-section variants → drop markers in as additive lanes.

Energy curve (the intro's shape; scale proportionally for 60–90 s):

1. **Opening** (first 2 bars): almost nothing — kick alone, pad enters on bar 1, nothing else.
2. **Thesis**: arps enter hushed; hats and rim join.
3. **Reveal**: the bed blooms once — chord hit plus a hum top-note.
4. **Body**: loop runs steady; markers whisper against it.
5. **Payoff**: bed thins — kick and arp gains down ~10–15%, markers drop out — so the on-screen text reads.
6. **Endcard**: resolve home — tonic chord, octave-doubled button note, ring damped. The final bar decays to silence: the last ≥ 1 s of the WAV is zero, so the render never clips the video's end.

Marker taxonomy — the sync vocabulary. Sync is punctuation, not arrangement: land a marker on every storyboard-named beat and leave ≥ 70% of bars marker-free.

| Storyboard event | Marker | Recipe |
|---|---|---|
| hard cut / section change | wood tick | `rim` or single piano note, gain ≤ .2 |
| uncover / fade-in of content | rise | 2-note ascending piano cascade, gain .15–.16, room .5 |
| wordmark / big reveal | bloom | full chord hit octaves 3–5, gain .3, release 1.5 |
| gravitas (ruling, gavel, slash) | shadow | low note octave 2–3, gain .18–.2, release 1.5–2, damped |
| endcard button | button | octave-doubled tonic, gain .24, release .5 |

## The Theory — Passive Pulse as Anti-Genre

Passive pulse doesn't have a cadenza, a drop, or a breakdown. Its equivalent moment is **the thinning** — the structural high point is a subtraction: the bed gets quieter, markers drop out, so the on-screen text can win the attention contest it must always win. Every performance genre spends its arc building toward *more*; this one builds toward *less*, and the only strong arrival in thirty seconds is the endcard button — an octave-doubled tonic at gain .24, quieter than anything a pop or trance track would call an event. That is the whole aesthetic in one sentence: music that knows it is furniture, engineered so precisely that it feels inevitable rather than absent.

The six canonical scores prove the style is a *template*, not a tradition: they share the vast majority of their bytes. Same `setcpm(30)` grid, same six bed lanes with identical recipes, same fifteen-bar skeleton, same master gain, same six-phase energy curve — the only degrees of freedom are the family key, the accent lane, the loop rotation, and the scene map's marker placements. Reproducibility isn't a side effect of the house style; it *is* the house style. A score that improvises novel material has already left the family.

Every device is a performance-genre device, inverted:

- **Pop's hook** — arrive early, repeat, be singable — becomes the marker: a one-shot figure that may never repeat. Punctuation, never a phrase.
- **Electro's multi-timescale interest** survives intact (16th-grid markers, bar-level chords, section-level energy) but is *capped* by the density ceiling: the interest migrates from density to **register**.
- **Trance's filter-as-emotion axis** is refused: no sweeps, no risers, no automation. Emotion is carried by pitch height and release time alone — a shadow is the same piano as a rise, two octaves down.
- **The drop** becomes the thinning; **the riser** becomes two quiet piano notes; **the anthem** becomes a bloom — one chord, octaves 3–5, gain .3, ring damped.
- **The final-chorus key change** becomes the endcard's return home — same key, one octave-doubled tonic, the only cadence, and it is whispered.

This gives the style its one genuinely novel component: a **register-coded semantics** — a leitmotif system without motifs. High and ascending reads as *uncover/positive* (rise); low in octaves 2–3 with a long damped ring reads as *gravitas/removal* (shadow); a mid-register wood tick reads as *neutral cut*; a full-register chord reads as *arrival/earned state* (bloom); the octave-doubled tonic reads as *home*. The viewer never learns these consciously — they're the same intuitions that make a film score's low piano mean dread — but scored consistently, they let a 30-second explainer carry narrative without a single melodic motif.

Two disciplines hold it all together. **Time:** the frame grid *is* the time signature — 120 BPM exists so that one beat is 15 frames and one bar is 60, and every storyboard beat quantizes into the music, never the reverse; the music serves the edit literally, at 1/16 precision (0.125 s). **Harmony:** flat keys and ninth-shell voicings across all families so the products register as kinship, and the V — when it appears — is a 7sus that refuses to resolve: agreement aesthetics, tension acknowledged and held, never slammed home. And the last discipline is silence: the final bar always decays so the WAV ends at zero for the last second. Furniture that stops talking exactly when the video does.

## Reproduction Kit

Everything below is extracted verbatim from the six canonical scores — the invariant parts that never change, the flexes that are allowed, and the placement math. A new score starts from this skeleton, not from a blank file.

### The invariant skeleton (canon tuning shown — retune arp/pad roots for accord: Db, synod: Bb minor)

```javascript
setcpm(30) // 120 BPM: 1 beat = .5 s = 15 frames @30fps; 1 bar = 2.000 s = 60 frames

// ── bed: six lanes, identical recipes across the corpus ──
const kick = s("bd ~ bd ~").bank("RolandTR909").gain(.45) // hook bars: "bd ~ ~ ~"; payoff bars: gain .40–.42
const tick = s("~ hh ~ hh").gain(.09).hpf(9000)          // whisper hats, 2 & 4 only
const rimt = s("~ ~ rim ~").gain(.13)                    // variant: "~ [~ rim] ~ ~" — and-of-2, off the kick
// one const per loop chord: root · dyad(3rd+5th) · dyad(7th/9th+color) · rest — three attacks, never four
const arpEb = note("eb3 [g3 bb3] [d4 f4] ~").s("piano").gain(.34).room(.35) // home chord carries the .34
const arpCm = note("c3 [g3 bb3] [d4 eb4] ~").s("piano").gain(.32).room(.35)
const arpAb = note("ab2 [c3 eb3] [g3 bb3] ~").s("piano").gain(.32).room(.35)
const arpGm = note("g2 [d3 f3] [bb3 d4] ~").s("piano").gain(.32).room(.35)
const pad = x => note(x).s("triangle").fm("<0 2 4>").clip(1).attack(.8).release(1.2).gain(.22).room(.4) // root only, oct 2
const hum = x => note(x).s("pluck").lpf(2600).gain(.18).room(.4) // accent lane — swap per family, never stack

// ── bar templates: one const per bar, b1..bN — N = seconds ÷ 2, rounded up ──
const b1 = stack(s("bd ~ ~ ~").bank("RolandTR909").gain(.45), pad("eb2"))        // S1 hook: almost nothing
const b2 = stack(s("bd ~ ~ ~").bank("RolandTR909").gain(.45), pad("eb2"),
  note("[eb4,bb4] ~ ~ ~").s("piano").gain(.22).room(.45))                         // thesis dyad: root+5th, oct 4
const b3 = stack(kick, arpEb, tick, rimt, pad("eb2"))                             // S2 mechanism: loop steady
const b8 = stack(kick, arpAb, tick, rimt, pad("ab2"),
  note("~ ~ ~ rim").gain(.17))                                                    // marker bars: additive lane only
const b12 = stack(s("bd ~ bd ~").bank("RolandTR909").gain(.4), arpCm.release(1.5), pad("c2"),
  note("~ ~ ~ [eb4,g4,bb4,d5,g5] ~ ~").s("piano").gain(.3).room(.5).release(1.5)) // S3 payoff: thinned, one bloom max
const b14 = stack(kick, arpEb.release(.6), pad("eb2"),
  note("~ ~ [eb4,eb5] ~").s("piano").gain(.24).room(.45).release(.5))             // S4 endcard button: octave tonic, damped
const b15 = stack(s("bd ~ ~ ~").bank("RolandTR909").gain(.4),
  note("[eb3,g3,bb3,f4]").s("piano").sustain(.2).release(.8).gain(.3).room(.5))   // final bar: maj9 shell, decays — zero ≥1 s before end

cat(b1, b2, b3, /* … one const per bar … */ b15).gain(.55)                        // master gain, always .55
```

### Marker placement math

Storyboard seconds → bars: `bar = floor(seconds ÷ 2)` (1-indexed). Remainder → 16th slot: `slot = 1 + round((seconds − 2·(bar−1)) ÷ 0.125)`. Prefer on-beat slots (1, 5, 9, 13) when the storyboard allows. Example: 23.625 s → bar 12, 1.625 s in → slot 14 → `"~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ [eb4,g4,bb4,d5,f5] ~ ~"` (canon-list's actual bloom), or nested by beat: `"~ ~ ~ [~ X ~ ~]"`. Nesting by beat reads better; flat 16-slots lands anywhere exactly.

### Invariants, flexes, and family swaps

Never changes: `setcpm(30)` · kick pattern/bank (never four-on-the-floor) · tick `hpf(9000)` · arp shape (three attacks, rest on beat 4, common-tone dyads between chords) · pad recipe · marker gain bands · master `.gain(.55)` · the six-phase curve (hook → thesis → mechanism loop → payoff thinning → endcard button → silent final bar) · ≥ 1 s of zero at the end · exactly one accent lane.

Allowed to flex: **loop rotation** — the mechanism may enter on any chord of the loop to match scene energy (canon-item starts on the IV; the endcard always returns to the family tonic) · rim on beat 3 vs and-of-2 · hum damping variant (canon-challenge uses `sustain(.2).release(.8)` — "fingered string") · kick gain .40–.45, rim .11–.13 · bloom gain .26–.3, rise .15–.16, shadow .18–.2 · section bar counts to the scene map, keeping the phase order.

Family swaps (accent lane only, hum position): accord → `note(x).s("piano").gain(.2).room(.4)` · canon → `s("pluck").lpf(2600).gain(.18).room(.4)` · synod → moog voice, LPF ≤ 1200. Keys: accord Db major (Dbmaj9 · Bbm9 · Gbmaj9 · Ab7sus) · canon Eb major (Ebmaj9 · Cm9 · Abmaj9 · Gm7) · synod Bb minor (Bbm9 · Gbmaj7 · Ebm9 · Ab). Flat spellings throughout.

## Context & Mix

Muted-first videos: all copy on-screen, no voice-over lane today — but compose as if one might arrive: keep the 1–4 kHz presence region sparse and leave headroom everywhere. Bass lives in octave 2 and is felt more than heard; highs end at the whisper hats; nothing bright survives above them. Gain staging (pre-master, from the canonical score): kick .40–.45 · arp .32–.34 room .35 · pad .22 attack .8 release 1.2 room .4 · hats ≤ .1 · rim ~.13 · hum .16–.22 · markers .15–.20 room .5 · bloom .3 · master `.gain(.55)`. Mount at `volume: 0.25` in `defineVideo`'s `music` field. Render with `pnpm --filter @useaccord/remotion score <name> <seconds>` (48 kHz, peak-guarded) — the `.strudel` file is the source, the WAV is an artifact; never hand-edit `public/audio/`.

## Reproduction Checklist

- [ ] Started from the skeleton above (or copied the nearest canonical score) — not from blank.
- [ ] Read the scene map; every named beat has a marker; ≥ 70% of bars are marker-free.
- [ ] Arp consts retuned to family key, common tones preserved between adjacent dyads.
- [ ] Loop rotation chosen to match scene energy; endcard returns to the tonic.
- [ ] Markers quantized to 1/16, on-beat where the storyboard allows.
- [ ] Payoff bars thinned (kick .40–.42, no markers over the reading lines).
- [ ] Final bar decays to zero ≥ 1 s before the WAV ends.
- [ ] Master `.gain(.55)`; nothing above .45 pre-master; one accent lane only.

## Do's and Don'ts

Do:

- Read `audio/accord-intro-30s.strudel` before composing a single bar — it is this brief, executable.
- Land a marker on every storyboard-named beat; leave most bars untouched.
- One chord per bar; common-tone voice leading; flat spellings.
- Thin the bed where text must read; bloom where things uncover.
- End silent — zero for the final second.
- Keep the family key and its single accent lane.

Don't:

- No snare backbeat, no fills, no drop, no risers, no impacts.
- No hummable melody — markers are punctuation, never a repeating phrase.
- No layer above gain .45 pre-master; master stays .55.
- No bright lead timbres — square/saw leads and bright plucks beyond the Canon accent are out.
- No tempo or key change mid-video; no chord faster than one per bar.
- Don't sync everything — music that mirrors every motion stops being background and starts being a metronome.
