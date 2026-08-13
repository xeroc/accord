import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  appName: "Canon Registry",
  network: "devnet",
  clusters: [
    createSolanaDevnet(DEVNET_RPC),
    createSolanaMainnet(MAINNET_RPC),
    createSolanaLocalnet("http://localhost:8899"),
  ],
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider connectorConfig={connectorConfig}>
        {children}
      </AppProvider>
    </QueryClientProvider>
  );
}
