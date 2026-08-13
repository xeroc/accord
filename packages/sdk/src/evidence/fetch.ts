/**
 * evidence/fetch.ts — framework-agnostic manifest fetch from the evidence daemon.
 *
 * GET {endpoint}/evidence/{subaccord}/{dispute}/{round}
 *
 * Returns the decrypted manifest (a YAML string for the `accord-evidence/v1`
 * format, or a parsed JSON object if the plaintext was JSON). `null` when no
 * bundle is stored for the round (404).
 *
 * This is the pure fetch — React apps wrap it in a `useQuery` hook
 * (see apps/app and apps/canon `useManifest.ts`).
 */
export interface FetchManifestParams {
  endpoint: string;
  subaccord: string;
  dispute: string;
  round: number;
}

export async function fetchManifest(
  params: FetchManifestParams,
): Promise<unknown> {
  const { endpoint, subaccord, dispute, round } = params;
  const res = await fetch(
    `${endpoint}/evidence/${subaccord}/${dispute}/${round}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`evidence daemon returned ${res.status}`);
  return res.json();
}
