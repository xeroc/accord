/**
 * JurorDashboardPage — `/juror` route.
 *
 * Lists every JurorStake owned by the connected wallet across all Subaccords
 * (`findJurorStakesByJuror`). Each stake is a card linking to the full
 * management panel at `/juror/stake?subaccord=<addr>`. Shows the totals a
 * juror cares about: total collateral, active draws, fees earned.
 */
import { Link } from "react-router-dom";

import { useSigner } from "../../shared/wallet";
import { formatTokenAmount } from "../../shared/format";
import { Copyable } from "../../components/Copyable";
import { useJurorStakes } from "./useJurorStakes";
import { StaggerGroup, StaggerItem } from "../../components/motion";

export function JurorDashboardPage() {
  const { signer } = useSigner();
  const {
    data: stakes,
    isLoading,
    isError,
    error,
  } = useJurorStakes(signer?.address);

  const totalStaked = stakes?.reduce((sum, s) => sum + s.data.staked, 0n) ?? 0n;
  const totalFees =
    stakes?.reduce((sum, s) => sum + s.data.feesEarned, 0n) ?? 0n;
  const activeDraws =
    stakes?.reduce((sum, s) => sum + s.data.activeDraws, 0) ?? 0;

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10">
      <header className="mb-8">
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.01em]">Juror.</h1>
        <p className="mb-4 text-muted-foreground">
          Your capital, your draws, your earned fees — across every subaccord.
        </p>
        <Link to="/subaccords" className="inline-flex items-center justify-center rounded-md bg-transparent px-3.5 py-2 text-sm font-semibold text-primary ring-1 ring-inset ring-primary transition-[background-color,scale] hover:bg-primary/10 active:scale-[0.96]">
          Find a pool to stake in.
        </Link>
      </header>

      {!signer ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="mb-2 text-lg font-semibold">Connect a wallet.</p>
          <p className="mb-5 text-muted-foreground">
            Your stakes read from your connected wallet address.
          </p>
        </div>
      ) : isLoading ? (
        <p className="text-sm text-text-secondary">Loading your stakes…</p>
      ) : isError ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="mb-2 text-lg font-semibold">Read failed.</p>
          <p className="mb-5 font-mono text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "RPC error."}
          </p>
        </div>
      ) : !stakes || stakes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="mb-2 text-lg font-semibold">No stakes yet.</p>
          <p className="mb-5 text-muted-foreground">
            Stake collateral in a subaccord to become draw-eligible.
          </p>
          <Link to="/subaccords" className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]">
            Browse subaccords.
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-3 rounded-lg border border-border-subtle bg-raised p-4 font-mono text-sm">
            <Total
              label="Total staked"
              value={formatTokenAmount(totalStaked)}
            />
            <Total label="Active draws" value={`${activeDraws}`} />
            <Total label="Fees earned" value={formatTokenAmount(totalFees)} />
          </div>

          <StaggerGroup className="list-none grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]" aria-label="Your stakes">
            {stakes.map((s) => (
              <StaggerItem key={s.address}>
                <Link
                  to={`/juror/stake?subaccord=${s.data.subaccord}`}
                  className="block rounded-lg bg-card p-4 ring-1 ring-foreground/10 transition-[box-shadow] hover:ring-amber/40"
                >
                  <span className="mb-3.5 block">
                    <Copyable value={s.data.subaccord} />
                  </span>
                  <dl className="gap-1.5 grid">
                    <Stat
                      label="Staked"
                      value={formatTokenAmount(s.data.staked)}
                    />
                    <Stat
                      label="Active draws"
                      value={`${s.data.activeDraws}`}
                    />
                    <Stat
                      label="Fees earned"
                      value={formatTokenAmount(s.data.feesEarned)}
                    />
                    {s.data.pendingWithdrawal > 0n && (
                      <Stat
                        label="Pending withdrawal"
                        value={formatTokenAmount(s.data.pendingWithdrawal)}
                      />
                    )}
                  </dl>
                  <span className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96] mt-3 inline-block">Manage. →</span>
                </Link>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </>
      )}
    </main>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}.</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
