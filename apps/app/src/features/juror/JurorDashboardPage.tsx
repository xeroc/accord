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
import {
  Button,
  Copyable,
  EmptyState,
  ErrorState,
  StaggerGroup,
  StaggerItem,
} from "@useaccord/ui";
import { useJurorStakes } from "./useJurorStakes";

export function JurorDashboardPage() {
  const { signer } = useSigner();
  const {
    data: stakes,
    isLoading,
    isError,
    error,
    refetch,
  } = useJurorStakes(signer?.address);

  const totalStaked = stakes?.reduce((sum, s) => sum + s.data.staked, 0n) ?? 0n;
  const totalFees =
    stakes?.reduce((sum, s) => sum + s.data.feesEarned, 0n) ?? 0n;
  const activeDraws =
    stakes?.reduce((sum, s) => sum + s.data.activeDraws, 0) ?? 0;

  return (
     <>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Juror.</h1>
        <p className="mb-4 text-muted-foreground">
          Your capital, your draws, your earned fees — across every subaccord.
        </p>
        <Button variant="outline" asChild>
          <Link to="/subaccords">Find a pool to stake in.</Link>
        </Button>
      </header>

      {!signer ? (
        <EmptyState
          title="Connect a wallet."
          description="Your stakes read from your connected wallet address."
        />
      ) : isLoading ? (
        <p className="text-sm text-text-secondary">Loading your stakes…</p>
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : "RPC error."}
          onRetry={() => void refetch()}
        />
      ) : !stakes || stakes.length === 0 ? (
        <EmptyState
          title="No stakes yet."
          description="Stake collateral in a subaccord to become draw-eligible."
          action={
            <Button asChild>
              <Link to="/subaccords">Browse subaccords.</Link>
            </Button>
          }
        />
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
                  className="block rounded-lg bg-card p-4 ring-1 ring-foreground/10 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.4)] hover:ring-amber/40"
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
                  <span className="mt-3 inline-block font-semibold text-primary">Manage. →</span>
                </Link>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </>
      )}
    </>
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
