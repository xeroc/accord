import { useState, type ReactNode } from "react";
import {
  AppProvider,
  createSolanaLocalnet,
  getDefaultConfig,
} from "@solana/connector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Account } from "@solana/kit";
import type { Dispute } from "@useaccord/sdk";
import { MotionConfig } from "motion/react";
import { MemoryRouter } from "react-router-dom";

/**
 * AppStage — mount REAL apps/app feature views inside a deterministic
 * provider stack. The cluster is localnet and is never contacted: the
 * react-query cache is pre-seeded (keys mirror the app hooks exactly) and
 * pinned with staleTime/gcTime Infinity, so every frame renders the same
 * data with zero network.
 */

/** The single cluster URL the harness exposes — query keys embed it. */
export const HARNESS_ENDPOINT = "http://localhost:8899";

const connectorConfig = getDefaultConfig({
  appName: "Accord — Remotion AppStage",
  network: "localnet",
  clusters: [createSolanaLocalnet(HARNESS_ENDPOINT)],
});

/** Query-cache seed — keys must mirror apps/app hooks exactly. */
export interface HarnessSeed {
  /** useDisputes() → ["disputes", endpoint] */
  disputes?: Account<Dispute>[];
  /** useDispute(address) → ["dispute", address, endpoint] */
  dispute?: Account<Dispute>;
}

export function AppHarness({
  route = "/",
  seed,
  children,
}: {
  /** MemoryRouter initial entry, e.g. "/disputes" or "/disputes/<addr>". */
  route?: string;
  seed?: HarnessSeed;
  children: ReactNode;
}) {
  // Captured on first mount: every frame of a Remotion render observes the
  // same seeded state. Change data across scenes by remounting (Sequence
  // boundary or an explicit key), not by mutating the seed.
  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
          gcTime: Infinity,
          refetchOnMount: false,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        },
      },
    });
    if (seed) {
      if (seed.disputes) {
        qc.setQueryData(["disputes", HARNESS_ENDPOINT], seed.disputes);
      }
      if (seed.dispute) {
        qc.setQueryData(
          ["dispute", seed.dispute.address as string, HARNESS_ENDPOINT],
          seed.dispute,
        );
      }
    }
    return qc;
  });

  return (
    <MotionConfig reducedMotion="always">
      <QueryClientProvider client={client}>
        <AppProvider connectorConfig={connectorConfig}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </AppProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}
