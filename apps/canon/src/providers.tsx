/**
 * Providers — wraps the app in ConnectorKit's AppProvider + MotionConfig.
 *
 * Configures wallet connection + cluster selection via getDefaultConfig.
 * Devnet is the default; RPC URLs come from VITE_* env vars.
 * Mirrors apps/app's provider structure (decision #2).
 */

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import {
  AppProvider,
  createSolanaDevnet,
  createSolanaLocalnet,
  createSolanaMainnet,
  getDefaultConfig,
} from "@solana/connector";

const DEVNET_RPC =
  import.meta.env.VITE_DEVNET_RPC ?? "https://api.devnet.solana.com";
const MAINNET_RPC =
  import.meta.env.VITE_MAINNET_RPC ?? "https://api.mainnet-beta.solana.com";

const connectorConfig = getDefaultConfig({
  appName: "Canon",
  network: "devnet",
  clusters: [
    createSolanaDevnet(DEVNET_RPC),
    createSolanaMainnet(MAINNET_RPC),
    createSolanaLocalnet("http://localhost:8899"),
  ],
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AppProvider connectorConfig={connectorConfig}>
        {children}
      </AppProvider>
    </MotionConfig>
  );
}
