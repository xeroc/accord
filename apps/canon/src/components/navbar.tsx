/**
 * Navbar — top status bar for the Canon registry dApp.
 *
 * Left: CANON wordmark + registry-rows glyph (≡).
 * Right: cluster selector (native <select> bound to useCluster) +
 *        wallet connect (inline connector buttons) / disconnect.
 *
 * IBM Plex Mono, ink/raised surfaces, hairline border — per DESIGN.md.
 * Lean variant: no Dialog / shadcn Select dependency (those land with the full
 * scaffold bean accord-9mut); this keeps the withdrawal feature self-contained.
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
import { shortenAddress } from "@/shared/format";

export function Navbar() {
  const { cluster, clusters, setCluster } = useCluster();
  const { connected, address } = useAccount();
  const { connect, isConnecting } = useConnectWallet();
  const { disconnect } = useDisconnectWallet();
  const connectors = useWalletConnectors();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Only wallets that advertise a solana:* chain.
  const solanaWallets = connectors.filter(
    (c) => c.ready && c.chains.some((chain) => chain.startsWith("solana:")),
  );

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3 font-mono">
      <Link to="/" className="flex items-center gap-2 text-foreground">
        {/* registry-rows glyph */}
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
            <line x1="6" y1="9" x2="26" y2="9" />
            <line x1="6" y1="16" x2="26" y2="16" />
            <line x1="6" y1="23" x2="26" y2="23" />
          </g>
        </svg>
        <span className="text-lg font-bold tracking-tight">CANON</span>
      </Link>

      <div className="flex items-center gap-3">
        {cluster && (
          <select
            value={cluster.id}
            onChange={(e) =>
              void setCluster(
                e.target.value as Parameters<typeof setCluster>[0],
              )
            }
            className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none"
            aria-label="Cluster"
          >
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
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
          <div className="relative">
            <Button
              size="sm"
              onClick={() => setPickerOpen((o) => !o)}
              disabled={isConnecting || solanaWallets.length === 0}
            >
              {isConnecting ? "Connecting…" : "Connect wallet."}
            </Button>
            {pickerOpen && (
              <div className="absolute right-0 top-9 z-10 flex w-56 flex-col gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
                {solanaWallets.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      void connect(c.id as Parameters<typeof connect>[0]);
                      setPickerOpen(false);
                    }}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                  >
                    <img src={c.icon} alt="" className="size-5" />
                    <span className="text-xs">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
