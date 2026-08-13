/**
 * useManifest — fetch the decrypted evidence manifest from the daemon.
 * Wraps the SDK's framework-agnostic `fetchManifest` in a React Query hook.
 *
 * GET {EVIDENCE_DAEMON_URL}/evidence/{subaccord}/{dispute}/{round}
 */
import { useQuery } from "@tanstack/react-query";
import { fetchManifest } from "@useaccord/sdk/evidence";
import { EVIDENCE_DAEMON_URL } from "./config";

export function useManifest(
  subaccord: string | undefined,
  dispute: string | undefined,
  round: number,
) {
  return useQuery({
    queryKey: ["manifest", subaccord, dispute, round],
    queryFn: () =>
      fetchManifest({
        endpoint: EVIDENCE_DAEMON_URL,
        subaccord: subaccord!,
        dispute: dispute!,
        round,
      }),
    enabled: !!subaccord && !!dispute,
    retry: false,
    staleTime: 60_000,
  });
}
