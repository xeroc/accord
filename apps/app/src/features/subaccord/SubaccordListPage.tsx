/**
 * Subaccord list view (accord-38y6).
 *
 * Browse every Subaccord on the Accord program via `findAllSubaccords(rpc)`
 * (SDK typed GPA wrapper — no raw bytes, no memcmp). TanStack Query caches the
 * read; cards show creator, staking token, staker count, total stake. Click →
 * `/subaccords/:address`. Empty + loading states are imperative (BRAND.md voice).
 *
 * Per decision #8: plain controlled fetch via useQuery; decision #4: cards on
 * brand tokens; BRAND.md voice: action verbs, no hedging.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { findAllSubaccords } from "@useaccord/sdk";

import { getRpc } from "../../shared/rpc";
import { shortAddress, formatTokenAmount } from "../../shared/format";
import { Skeleton } from "../../components/Skeleton";

/** `Account<Subaccord>` derived from the SDK query fn (Subaccord type isn't on
 * the SDK's public surface — derive rather than widen it). */
type SubaccordAccount = Awaited<ReturnType<typeof findAllSubaccords>>[number];

export function SubaccordListPage() {
  // ponytail: devnet default; cluster selector lands with the navbar/wallet bean.
  const rpc = getRpc("devnet");
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["subaccords"],
    queryFn: () => findAllSubaccords(rpc),
    staleTime: 30_000,
  });

  return (
    <main className="page">
      <header className="page-head">
        <h1 className="title">Subaccords.</h1>
        <p className="lede">Stake pools adjudicating one class of dispute.</p>
        <Link to="/subaccords/new" className="cta">
          Create a subaccord.
        </Link>
      </header>

      {isLoading ? (
        <SubaccordGridSkeleton />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : "RPC error."}
          onRetry={() => void refetch()}
        />
      ) : data && data.length > 0 ? (
        <ul className="grid" aria-label="Subaccords">
          {data.map((s) => (
            <SubaccordCard key={s.address} subaccord={s} />
          ))}
        </ul>
      ) : (
        <EmptyState />
      )}
    </main>
  );
}

function SubaccordCard({ subaccord }: { subaccord: SubaccordAccount }) {
  const d = subaccord.data;
  return (
    <li>
      <Link to={`/subaccords/${subaccord.address}`} className="card">
        <span className="card-address mono">
          {shortAddress(subaccord.address)}
        </span>
        <dl className="card-stats">
          <Stat
            label="Creator"
            value={<span className="mono">{shortAddress(d.creator)}</span>}
          />
          <Stat
            label="Staking token"
            value={<span className="mono">{shortAddress(d.stakingToken)}</span>}
          />
          <Stat label="Stakers" value={d.stakerCount.toString()} />
          <Stat label="Total stake" value={formatTokenAmount(d.totalStake)} />
        </dl>
      </Link>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <dt>{label}.</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SubaccordGridSkeleton() {
  return (
    <ul className="grid" aria-busy aria-label="Loading subaccords">
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

function EmptyState() {
  // BRAND.md voice — imperative, no hedging: "No subaccords yet." not "No results found."
  return (
    <div className="empty">
      <p className="empty-head">No subaccords yet.</p>
      <p className="empty-body">
        Create the first pool. Stake jurors. File a dispute.
      </p>
      <Link to="/subaccords/new" className="cta">
        Create a subaccord.
      </Link>
    </div>
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
