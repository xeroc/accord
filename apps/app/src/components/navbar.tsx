/**
 * Navbar — top status bar.
 *
 * Left: ACCORD wordmark + convergence glyph (◇).
 * Right: cluster selector (shadcn Select bound to useCluster) +
 *        wallet connect/disconnect button.
 *
 * IBM Plex Mono, ink/raised surfaces, hairline border — per BRAND.md.
 */

import { useState } from "react";
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  // Only wallets that advertise a solana:* chain.
  const solanaWallets = connectors.filter(
    (c) => c.ready && c.chains.some((chain) => chain.startsWith("solana:")),
  );

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between bg-card/80 px-6 py-3 font-mono backdrop-blur-xl supports-[backdrop-filter]:bg-card/70 [@media(prefers-reduced-transparency:reduce)]:bg-card [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none">
      <Link to="/" className="flex items-center gap-2 text-foreground">
        <svg
          width="20"
          height="20"
          viewBox="0 0 32 32"
          aria-hidden="true"
          className="text-amber"
        >
          <g
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="square"
            fill="none"
          >
            <line x1="7.5" y1="8.5" x2="16" y2="16" />
            <line x1="24.5" y1="8.5" x2="16" y2="16" />
            <line x1="16" y1="25" x2="16" y2="16" />
          </g>
          <circle cx="16" cy="16" r="2.6" fill="currentColor" />
        </svg>
        <span className="text-lg font-bold tracking-tight">ACCORD</span>
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
          <>
            <Button
              size="sm"
              onClick={() => setWalletModalOpen(true)}
              disabled={isConnecting || solanaWallets.length === 0}
            >
              {isConnecting ? "Connecting…" : "Connect wallet."}
            </Button>
            <Dialog open={walletModalOpen} onOpenChange={setWalletModalOpen}>
              <DialogContent className="font-mono">
                <DialogHeader>
                  <DialogTitle>Connect a wallet</DialogTitle>
                  <DialogDescription>
                    Select a Solana wallet to continue.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-1">
                  {solanaWallets.map((c) => (
                    <DialogClose asChild key={c.id}>
                      <button
                        type="button"
                        onClick={() =>
                          void connect(c.id as Parameters<typeof connect>[0])
                        }
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent"
                      >
                        <img src={c.icon} alt="" className="size-6 rounded-sm outline outline-1 -outline-offset-1 outline-white/10" />
                        <span className="text-sm">{c.name}</span>
                      </button>
                    </DialogClose>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </header>
  );
}
