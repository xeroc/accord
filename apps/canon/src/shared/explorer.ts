/**
 * explorer.ts — external deep links.
 *
 * `VITE_EXPLORER_ACCOUNT_URL` is a URL template containing a `{pubkey}`
 * placeholder; default Solscan. Every surface that shows an item (the curated
 * account) links out through {@link explorerAccountUrl} so the deployed
 * environment can retarget the explorer without code changes.
 *
 * {@link accordSubaccordUrl} deep-links a Subaccord public key to its page on
 * the Accord dApp — every surface that shows a Subaccord key links through it.
 */
const TEMPLATE =
  import.meta.env.VITE_EXPLORER_ACCOUNT_URL ??
  "https://solscan.io/account/{pubkey}";

const ACCORD_APP_URL =
  import.meta.env.VITE_ACCORD_APP_URL ?? "https://app.useaccord.xyz";

/** Deep link to the explorer page for an account pubkey (base58 — no encoding). */
export function explorerAccountUrl(pubkey: string): string {
  return TEMPLATE.split("{pubkey}").join(pubkey);
}

/** Deep link to the subaccord's page on the Accord dApp
 * (`${VITE_ACCORD_APP_URL}/#/subaccords/{pubkey}`). */
export function accordSubaccordUrl(pubkey: string): string {
  return `${ACCORD_APP_URL}/#/subaccords/${pubkey}`;
}
