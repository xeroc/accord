/**
 * Navbar — top status bar.
 *
 * Left: SYNOD wordmark + the Assembly glyph (SynodLogo).
 * Right: cluster selector (shadcn Select bound to useCluster) +
 *        wallet connect/disconnect button.
 *
 * Shell is the shared ProductNavbar pattern (@useaccord/ui); the brand
 * `<Link>` and all wallet/cluster logic stay app-side.
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
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ProductNavbar,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@useaccord/ui";
import { shortenAddress } from "@/shared/format";
import { SynodLogo } from "@/components/synod-logo";

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
    <ProductNavbar
      brand={
        <Link to="/" className="flex items-center gap-2 text-foreground">
          <SynodLogo className="size-5" />
          <span className="text-lg font-bold tracking-tight">SYNOD</span>
        </Link>
      }
      accountControls={
        <>
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
        </>
      }
    />
  );
}
