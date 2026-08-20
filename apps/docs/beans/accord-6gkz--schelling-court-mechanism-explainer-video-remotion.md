---
# accord-6gkz
title: Schelling-court mechanism explainer video (Remotion)
status: completed
type: feature
priority: normal
created_at: 2026-08-19T22:59:57Z
updated_at: 2026-08-19T23:47:35Z
---

A ~29s Remotion video (videos/schelling-court) that sequentially explains how Accord converges on a coherent Ruling: draw (VRF from staked pool) -> commit (hash(vote, salt)) -> reveal -> participation fee to all jurors -> slash incoherent -> redistribute to coherent -> Ruling = majority option. Uses @useaccord/ui tokens, EASE_EXPO brand curve, deterministic random(). Verify via still frames at each phase + final mp4 render.

## REWRITTEN SCOPE (2026-08-20 — supersedes content above)

Deliverable changed from Remotion video to a **Lottie** (built with the text-to-lottie skill, verified in the local Skia Skottie player). Remotion is explicitly out. Same 7-beat script (draw → commit → reveal → fee → slash → redistribute → ruling), same @useaccord/ui tokens + EASE_EXPO curve, deterministic values. Motion concept is defined first per the motion-design skill (Premium/Corporate personality, stake-ring visual system, amber coherence thread, ~20s one-shot, 1920×1080@60fps); Lottie scene authored against that concept next.

## Summary of Changes

Created `videos/schelling-court/` (local-only, gitignored per framework rules) — a 28.5s @1920x1080@30 Remotion explainer of the Schelling-court mechanism, one continuous take with a persistent 5-juror bench:

- `scenes/timeline.ts` — single source of truth: phase table (draw/commit/reveal/fee/slash/profit/ruling), per-juror stagger beats, absolute 1080p layout, on-screen economics (fee 125 = 5x25, slash 40 = 4x10).
- `scenes/pieces.tsx` — JurorCard (draw materialize -> hash scramble lock -> flip reveal -> fee chip -> stake shrink/grow -> slash shake+glow), Pool (30 dots, VRF shimmer, 5 pop), VrfLabel, Coin arcs, Shard gravity fall, Vault, Pot, Tally, Ruling stamp, StepTracker, Caption, Title, Header.
- `scenes/court.tsx` — choreography: fee arrives from above, punishment falls, reward rises, stamp lands center while court recedes.
- `scenes/backdrop.tsx` — ambient layer adapted from accord-30s (calmer).
- Domain language: Ruling (not verdict), Coherent/Incoherent, hash(vote, salt) per CONTEXT.md.

Fixed en route: Title accidentally dropped during a Backdrop edit; slot rotateX started edge-on hiding commit hashes (now per-span flip: hash out, vote in); added slash glow for beat weight.

Verification: tsc + package lint green; 10 phase stills pixel-verified (title/amber/red/green/stamp/coins/shards); final mp4 (9.6MB, 855 frames) rendered and frame-probed at t=7.0/11.5/17.2/24.2 — all seven beats present. Output: `apps/remotion/out/schelling-court.mp4`.

Note: first still batch was misleading (stale webpack bundle + the two real bugs above) — resolved via temporary coordinate crosshairs proving 1:1 canvas mapping.

## Revision 2 — illustration-only cut (user feedback)

- Removed title slide, end card, header chrome (wordmark + dispute chip), bottom step tracker, and long captions.
- One-word beat headline above the illustration (DRAW/COMMIT/REVEAL/FEE/SLASH/PROFIT/RULING), fade+slide cross-fade, tone-colored for slash/profit/ruling.
- Draw simplified: pool dots pop amber in place (no VRF shimmer/scan label); after selection the pool fades out and the camera zooms 0.85->1.12 into the jury (transform origin pinned at jury center).
- Replaced falling red shards with a two-stroke red X drawn over the incoherent juror's vote (the 'long red lines' were unreadable).
- Duration 855 -> 750 frames (25s).

Verified: tsc + lint green; 10 stills + 6 mp4 frames pixel-checked (pool gone by f90, zoom confirmed via card-pixel density 43.8k->84.8k, cross-out spans the slot y305-351, hashes/stamp/coins/green all present). Output: apps/remotion/out/schelling-court.mp4 (7.7MB).

## Summary of Changes (2026-08-20)

Delivered as a Lottie (no Remotion involved):
- Player project scaffolded at `~/projects/Accord/schelling-court-lottie` (diffusionstudio/lottie, Skottie/canvaskit-wasm 0.41.1), dev server on port 5199.
- Scene `public/projects/schelling-court/scene-1/lottie.json` (+ `controls.json`): 1920×1080 @60fps, 1240 frames (~20.7s), 78 layers, 5 precomp assets, 513 KB, fully vector.
- Chapters implemented per motion concept: title → draw (VRF sweep over stake-weighted pool, 5 jurors lift to row, stake rings trim-draw) → commit (hexagon ballots trim-draw + amber hash-flash + hashes) → reveal (scaleX flip, chips arc to A/B/C columns, tally 3/5, amber Schelling-point highlight + underline) → fee (green coins from case file to all jurors) → slash (red hairlines identify incoherent, ring trim drains, fragments detach) → redeem (fragments fly to coherent jurors, rings re-close amber, +0.6 labels) → ruling (A chips merge into amber seal, checkmark trim-draw, glow, hold).
- Deterministic generator committed at `gen/schelling-court.mjs` (+ `gen/fonts/` IBM Plex TTFs); regen: `node gen/schelling-court.mjs`.
- Deviation from concept: native Lottie text renders blank in this Skottie build (probed: font files fetched + fFamily/fPath variants all fail), so ALL text is baked to bezier glyph outlines via opentype.js. Text slots dropped (bgColor slot remains).
- Verification: construct-isolation probes (animated opacity/position/scale/trim/repeater/precomp/color-kf all pass), then ASCII-render + pixel-region analysis of 20 pinned frames in the official player covering every chapter, seams, and boundary frames (0, op−1). Browser needed `--enable-unsafe-swiftshader` for WebGL.
