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
    <main className="page">
      <header className="page-head">
        <h1 className="title">Juror.</h1>
        <p className="lede">
          Your capital, your draws, your earned fees — across every subaccord.
        </p>
        <Link to="/subaccords" className="cta cta-ghost">
          Find a pool to stake in.
        </Link>
      </header>

      {!signer ? (
        <div className="empty">
          <p className="empty-head">Connect a wallet.</p>
          <p className="empty-body">
            Your stakes read from your connected wallet address.
          </p>
        </div>
      ) : isLoading ? (
        <p className="text-sm text-text-secondary">Loading your stakes…</p>
      ) : isError ? (
        <div className="empty">
          <p className="empty-head">Read failed.</p>
          <p className="empty-body mono">
            {error instanceof Error ? error.message : "RPC error."}
          </p>
        </div>
      ) : !stakes || stakes.length === 0 ? (
        <div className="empty">
          <p className="empty-head">No stakes yet.</p>
          <p className="empty-body">
            Stake collateral in a subaccord to become draw-eligible.
          </p>
          <Link to="/subaccords" className="cta">
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

          <ul className="grid" aria-label="Your stakes">
            {stakes.map((s) => (
              <li key={s.address}>
                <Link
                  to={`/juror/stake?subaccord=${s.data.subaccord}`}
                  className="card"
                >
                  <span className="card-address">
                    <Copyable value={s.data.subaccord} />
                  </span>
                  <dl className="card-stats">
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
                  <span className="cta mt-3 inline-block">Manage. →</span>
                </Link>
              </li>
            ))}
          </ul>
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
    <div className="stat">
      <dt>{label}.</dt>
      <dd>{value}</dd>
    </div>
  );
}
