/**
 * Navbar — top status bar.
 *
 * Left: ACCORD wordmark + convergence glyph (◇).
 * Right: cluster selector (shadcn Select bound to useCluster) +
 *        wallet connect/disconnect button.
 *
 * IBM Plex Mono, ink/raised surfaces, hairline border — per BRAND.md.
 */

import { Link } from "react-router-dom";
import {
  useAccount,
  useCluster,
  useConnectWallet,
  useDisconnectWallet,
  useWalletConnectors,
} from "@solana/connector";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { shortenAddress } from "@/shared/format";

export function Navbar() {
  const { cluster, clusters, setCluster } = useCluster();
  const { connected, address } = useAccount();
  const { connect, isConnecting } = useConnectWallet();
  const { disconnect } = useDisconnectWallet();
  const connectors = useWalletConnectors();

  const readyConnectors = connectors.filter((c) => c.ready);

  async function handleConnect() {
    const first = readyConnectors[0];
    if (first) {
      await connect(first.id);
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3 font-mono">
      <Link to="/" className="flex items-center gap-2 text-foreground">
        <span className="text-lg font-bold tracking-tight">ACCORD</span>
        <span className="text-primary">◇</span>
      </Link>

      <div className="flex items-center gap-3">
        {cluster && (
          <Select
            value={cluster.id}
            onValueChange={(id) =>
              void setCluster(id as Parameters<typeof setCluster>[0])
            }
          >
            <SelectTrigger className="w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {clusters.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {connected && address ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {shortenAddress(address)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void disconnect()}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            onClick={() => void handleConnect()}
            disabled={isConnecting || readyConnectors.length === 0}
          >
            {isConnecting ? "Connecting…" : "Connect wallet."}
          </Button>
        )}
      </div>
    </header>
  );
}
