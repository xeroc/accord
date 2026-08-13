/**
 * Navbar — top status bar for the Canon Registry dApp.
 *
 * Left: CANON wordmark + registry-rows glyph (☰).
 * Right: cluster selector (shadcn Select bound to useCluster) +
 *        wallet connect/disconnect button.
 *
 * IBM Plex Mono, ink/raised surfaces, hairline border — per BRAND.md / DESIGN.md.
 * Mirrors apps/app's navbar structure (decision #2).
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
    <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3 font-mono">
      <Link to="/" className="flex items-center gap-2 text-foreground">
        {/* Registry-rows glyph: three stacked lines (a curated list) */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 32 32"
          aria-hidden="true"
          className="text-amber"
        >
          <g
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            fill="none"
          >
            <line x1="6" y1="9" x2="26" y2="9" />
            <line x1="6" y1="16" x2="22" y2="16" />
            <line x1="6" y1="23" x2="18" y2="23" />
          </g>
          {/* Amber check — the verdict Canon delivers */}
          <path
            d="M21 20 L24 23 L29 17"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        <span className="text-lg font-bold tracking-tight">CANON</span>
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
                        <img src={c.icon} alt="" className="size-6" />
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
