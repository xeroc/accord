/**
 * Deterministic seeded PRNG — a verbatim port of Remotion's `random()`
 * (mulberry32 over a 32-bit string hash; see remotion/dist/cjs/random.js)
 * so the kit's Backdrop node fields are byte-identical to the video
 * backdrop the values were designed against. Same seed → same number,
 * forever, across runtimes.
 */
function mulberry32(a: number): number {
  let t = a + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function seededRandom(seed: string): number {
  return mulberry32(hashCode(seed));
}
