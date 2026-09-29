/**
 * useManifest — fetch the decrypted evidence manifest from the daemon.
 * Wraps the SDK's framework-agnostic `fetchManifest` in a React Query hook.
 *
 * GET {daemonUrl}/evidence/{subaccord}/{dispute}/{round} — the daemon URL
 * follows the active cluster (useEvidenceDaemonUrl), which is part of the
 * query key so cluster switches refetch from the right daemon.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchManifest } from "@useaccord/sdk/evidence";
import { useEvidenceDaemonUrl } from "@/shared/useEvidenceDaemonUrl";

export function useManifest(
  subaccord: string | undefined,
  dispute: string | undefined,
  round: number,
) {
  const endpoint = useEvidenceDaemonUrl();
  return useQuery({
    queryKey: ["manifest", subaccord, dispute, round, endpoint],
    queryFn: () =>
      fetchManifest({
        endpoint,
        subaccord: subaccord!,
        dispute: dispute!,
        round,
      }),
    enabled: !!subaccord && !!dispute,
    retry: false,
    staleTime: 60_000,
  });
}
