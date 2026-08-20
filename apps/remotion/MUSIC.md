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

## Context & Mix

Muted-first videos: all copy on-screen, no voice-over lane today — but compose as if one might arrive: keep the 1–4 kHz presence region sparse and leave headroom everywhere. Bass lives in octave 2 and is felt more than heard; highs end at the whisper hats; nothing bright survives above them. Gain staging (pre-master, from the canonical score): kick .40–.45 · arp .32–.34 room .35 · pad .22 attack .8 release 1.2 room .4 · hats ≤ .1 · rim ~.13 · hum .16–.22 · markers .15–.20 room .5 · bloom .3 · master `.gain(.55)`. Mount at `volume: 0.25` in `defineVideo`'s `music` field. Render with `pnpm --filter @useaccord/remotion score <name> <seconds>` (48 kHz, peak-guarded) — the `.strudel` file is the source, the WAV is an artifact; never hand-edit `public/audio/`.

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
