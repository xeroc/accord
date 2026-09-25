/**
 * timeline.ts — the single source of truth for the dispute-lifecycle
 * video choreography. Four hard-cut scenes over the shared Backdrop:
 * the family title card, B1 (the state machine traversal), B2
 * (commit-reveal), and the family end card.
 *
 *   title       0    – 120    mark draw-on, wordmark, rule
 *   lifecycle   120  – 510    B1 — one case walks the machine
 *   commit      510  – 780    B2 — why votes are sealed
 *   endcard     780  – 900    mark, wordmark, useaccord.xyz
 */
export const FPS = 30;

export const TITLE_FRAMES = 120; // 4s
export const LIFECYCLE_FRAMES = 390; // 13s — B1
export const COMMIT_REVEAL_FRAMES = 270; // 9s — B2
export const ENDCARD_FRAMES = 120; // 4s

export const DURATION_IN_FRAMES =
  TITLE_FRAMES + LIFECYCLE_FRAMES + COMMIT_REVEAL_FRAMES + ENDCARD_FRAMES; // 900 = 30s
