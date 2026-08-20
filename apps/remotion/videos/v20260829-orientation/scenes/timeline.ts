/**
 * timeline.ts — single source of truth for v20260829-orientation.
 *
 * The three group-A concept proposals (system map, Schelling point,
 * Arbitrable spine) adapted from loop storyboards to one linear cut:
 * each concept's beat structure plays once inside its scene, wrapped
 * in the family title/endcard. All numbers are frames @30fps; each
 * scene keeps its own beat table + layout constants beside its markup.
 */

export const FPS = 30;

/** Scene lengths (frames). Their sum is durationInFrames. */
export const SCENE = {
  title: 90, // 3.0s  — family title card
  map: 345, // 11.5s — A1 system map (build + four flow beats)
  schelling: 375, // 12.5s — A2 nested arcs + payoff matrix + whale
  spine: 450, // 15.0s — A3 CPI boundary payload shrink
  endcard: 90, // 3.0s  — family end card
} as const;

/** Absolute start frames of each scene. */
export const AT = {
  map: SCENE.title,
  schelling: SCENE.title + SCENE.map,
  spine: SCENE.title + SCENE.map + SCENE.schelling,
  endcard: SCENE.title + SCENE.map + SCENE.schelling + SCENE.spine,
} as const;

export const DURATION_IN_FRAMES =
  SCENE.title + SCENE.map + SCENE.schelling + SCENE.spine + SCENE.endcard;
