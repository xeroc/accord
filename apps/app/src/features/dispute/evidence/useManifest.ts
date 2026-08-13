/**
 * useManifest — fetch the decrypted evidence manifest from the evidence daemon.
 *
 * GET {EVIDENCE_DAEMON_URL}/evidence/{subaccord}/{dispute}/{round}
 *
 * Returns the decrypted manifest (a YAML string for the `accord-evidence/v1`
 * format, or a parsed JSON object if the plaintext was JSON). `null` when no
 * bundle is stored for the round (404).
 */
import { useQuery } from "@tanstack/react-query";
import { EVIDENCE_DAEMON_URL } from "./config";

export function useManifest(
  subaccord: string | undefined,
  dispute: string | undefined,
  round: number,
) {
  return useQuery({
    queryKey: ["manifest", subaccord, dispute, round],
    queryFn: async () => {
      const res = await fetch(
        `${EVIDENCE_DAEMON_URL}/evidence/${subaccord}/${dispute}/${round}`,
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`evidence daemon returned ${res.status}`);
      return (await res.json()) as unknown;
    },
    enabled: !!subaccord && !!dispute,
    retry: false,
    staleTime: 60_000,
  });
}
