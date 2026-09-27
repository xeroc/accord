/**
 * evidence/base64.ts — base64 codec for the daemon's JSON wire fields
 * (internal to the evidence module; not exported from the barrel).
 *
 * Standard alphabet, no padding concerns for this protocol's fixed-size
 * fields. Runs on the global `btoa`/`atob` (Node ≥16, Bun, browsers).
 */

/** Uint8Array → base64 string. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** base64 string → Uint8Array. Throws on invalid input. */
export function fromBase64(s: string): Uint8Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
