/**
 * JurorBrowsePage — `/juror/browse` route.
 *
 * Lists every active juror (staked > 0) across all Subaccords. Fetches all
 * Subaccords + all JurorStakes, joins them to resolve per-mint amounts, and
 * groups by juror wallet. Shows cross-subaccord count, active draws, and
 * per-mint staked/fees breakdowns.
 *
 * Different Subaccords may use different collateral and fee mints (ADR-0020),
 * so raw amounts are grouped by mint — never summed across mints. Each mint
 * line shows the mint address (copyable) alongside the raw token amount.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { type Account, type Address } from "@solana/kit";
import {
  findAllJurorStakes,
  findAllSubaccords,
  type JurorStake,
  type Subaccord,
} from "@useaccord/sdk";

import { useClusterRpc } from "../../shared/rpc";
import { formatTokenAmount } from "../../shared/format";
import { Copyable } from "../../components/Copyable";
import { Skeleton } from "../../components/Skeleton";

// --- aggregation types ---

interface MintAmount {
  mint: Address;
  amount: bigint;
}

interface JurorSummary {
  address: Address;
  subaccords: Address[];
  activeDraws: number;
  stakedByMint: MintAmount[];
  feesByMint: MintAmount[];
}

// --- pure aggregation ---

function aggregateJurors(
  stakes: Account<JurorStake>[],
  subaccords: Account<Subaccord>[],
): JurorSummary[] {
  // subaccord → { staking mint, fee mint }
  const mintsBySub = new Map<
    Address,
    { staking: Address; fee: Address }
  >();
  for (const sub of subaccords) {
    mintsBySub.set(sub.address, {
      staking: sub.data.stakingToken,
      fee: sub.data.feeToken,
    });
  }

  // group active stakes (staked > 0) by juror wallet
  const byJuror = new Map<Address, Account<JurorStake>[]>();
  for (const stake of stakes) {
    if (stake.data.staked === 0n) continue;
    const arr = byJuror.get(stake.data.juror) ?? [];
    arr.push(stake);
    byJuror.set(stake.data.juror, arr);
  }

  const summaries: JurorSummary[] = [];
  for (const [juror, jurorStakes] of byJuror) {
    const subaccordSet = new Set<Address>();
    let activeDraws = 0;
    const stakedMap = new Map<Address, bigint>();
    const feesMap = new Map<Address, bigint>();

    for (const s of jurorStakes) {
      subaccordSet.add(s.data.subaccord);
      activeDraws += s.data.activeDraws;

      const mints = mintsBySub.get(s.data.subaccord);
      if (mints) {
        stakedMap.set(
          mints.staking,
          (stakedMap.get(mints.staking) ?? 0n) + s.data.staked,
        );
        if (s.data.feesEarned > 0n) {
          feesMap.set(
            mints.fee,
            (feesMap.get(mints.fee) ?? 0n) + s.data.feesEarned,
          );
        }
      }
    }

    summaries.push({
      address: juror,
      subaccords: [...subaccordSet],
      activeDraws,
      stakedByMint: [...stakedMap.entries()].map(([mint, amount]) => ({
        mint,
        amount,
      })),
      feesByMint: [...feesMap.entries()].map(([mint, amount]) => ({
        mint,
        amount,
      })),
    });
  }

  // most active jurors first
  summaries.sort(
    (a, b) =>
      b.subaccords.length - a.subaccords.length ||
      b.activeDraws - a.activeDraws,
  );

  return summaries;
}

// --- component ---

export function JurorBrowsePage() {
  const rpc = useClusterRpc()?.rpc ?? null;

  const subaccordsQ = useQuery({
    queryKey: ["subaccords", rpc],
    queryFn: () => findAllSubaccords(rpc!),
    enabled: Boolean(rpc),
    staleTime: 30_000,
  });

  const stakesQ = useQuery({
    queryKey: ["juror-stakes-all", rpc],
    queryFn: () => findAllJurorStakes(rpc!),
    enabled: Boolean(rpc),
    staleTime: 20_000,
  });

  const isLoading = subaccordsQ.isLoading || stakesQ.isLoading;
  const isError = subaccordsQ.isError || stakesQ.isError;
  const error = subaccordsQ.error ?? stakesQ.error;

  const jurors =
    subaccordsQ.data && stakesQ.data
      ? aggregateJurors(stakesQ.data, subaccordsQ.data)
      : [];

  return (
    <main className="page">
      <header className="page-head">
        <Link to="/juror" className="back">
          ← Juror dashboard.
        </Link>
        <h1 className="title">Jurors.</h1>
        <p className="lede">
          Every active juror across all subaccords. Staked amounts are grouped
          by mint — different pools may use different collateral.
        </p>
      </header>

      {isLoading ? (
        <JurorGridSkeleton />
      ) : isError ? (
        <ErrorState
          message={
            error instanceof Error ? error.message : "RPC error."
          }
          onRetry={() => {
            void subaccordsQ.refetch();
            void stakesQ.refetch();
          }}
        />
      ) : jurors.length > 0 ? (
        <ul className="grid" aria-label="Jurors">
          {jurors.map((juror) => (
            <JurorCard key={juror.address} juror={juror} />
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p className="empty-head">No active jurors.</p>
          <p className="empty-body">
            No one is staked yet. Stake collateral in a subaccord to appear
            here.
          </p>
          <Link to="/subaccords" className="cta">
            Browse subaccords.
          </Link>
        </div>
      )}
    </main>
  );
}

function JurorCard({ juror }: { juror: JurorSummary }) {
  return (
    <li className="card">
      <span className="card-address">
        <Copyable value={juror.address} />
      </span>
      <dl className="card-stats">
        <Stat
          label="Subaccords"
          value={juror.subaccords.length.toString()}
        />
        <Stat label="Active draws" value={juror.activeDraws.toString()} />
      </dl>
      {juror.stakedByMint.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <p className="font-mono text-xs text-muted-foreground">Staked</p>
          {juror.stakedByMint.map((s) => (
            <div key={s.mint} className="stat">
              <dt>
                <Copyable value={s.mint} />
              </dt>
              <dd className="mono">{formatTokenAmount(s.amount)}</dd>
            </div>
          ))}
        </div>
      )}
      {juror.feesByMint.length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          <p className="font-mono text-xs text-muted-foreground">
            Fees earned
          </p>
          {juror.feesByMint.map((f) => (
            <div key={f.mint} className="stat">
              <dt>
                <Copyable value={f.mint} />
              </dt>
              <dd className="mono">{formatTokenAmount(f.amount)}</dd>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="stat">
      <dt>{label}.</dt>
      <dd>{value}</dd>
    </div>
  );
}

function JurorGridSkeleton() {
  return (
    <ul className="grid" aria-busy aria-label="Loading jurors">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="card card-skeleton">
          <Skeleton style={{ width: "60%", height: "1rem" }} />
          <Skeleton
            style={{ width: "80%", height: "0.85rem", marginTop: "0.75rem" }}
          />
          <Skeleton
            style={{ width: "50%", height: "0.85rem", marginTop: "0.4rem" }}
          />
        </li>
      ))}
    </ul>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="empty">
      <p className="empty-head">Read failed.</p>
      <p className="empty-body mono">{message}</p>
      <button type="button" className="cta" onClick={onRetry}>
        Retry.
      </button>
    </div>
  );
}
