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

import { useClusterRpc } from "../../shared/rpc";
import { formatTokenAmount } from "../../shared/format";
import {
  Copyable,
  Skeleton,
  StaggerGroup,
  StaggerItem,
  Reveal,
} from "@useaccord/ui";

/** `Account<Subaccord>` derived from the SDK query fn (Subaccord type isn't on
 * the SDK's public surface — derive rather than widen it). */
type SubaccordAccount = Awaited<ReturnType<typeof findAllSubaccords>>[number];

export function SubaccordListPage() {
  const rpc = useClusterRpc()?.rpc ?? null;
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["subaccords", rpc],
    queryFn: () => findAllSubaccords(rpc!),
    enabled: Boolean(rpc),
    staleTime: 30_000,
  });

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10">
      <header className="mb-8">
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.01em]">Subaccords.</h1>
        <p className="mb-4 text-muted-foreground">Stake pools adjudicating one class of dispute.</p>
        <Link to="/subaccords/new" className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]">
          Create a subaccord.
        </Link>
      </header>

      <Reveal state={isLoading ? "skeleton" : isError ? "error" : data && data.length > 0 ? "content" : "empty"}>
        {isLoading ? (
          <SubaccordGridSkeleton />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : "RPC error."}
            onRetry={() => void refetch()}
          />
        ) : data && data.length > 0 ? (
          <StaggerGroup className="list-none grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]" aria-label="Subaccords">
            {data.map((s) => (
              <SubaccordCard key={s.address} subaccord={s} />
            ))}
          </StaggerGroup>
        ) : (
          <EmptyState />
        )}
      </Reveal>
    </main>
  );
}

function SubaccordCard({ subaccord }: { subaccord: SubaccordAccount }) {
  const d = subaccord.data;
  return (
    <StaggerItem>
      <Link to={`/subaccords/${subaccord.address}`} className="block rounded-lg bg-card p-4 ring-1 ring-foreground/10 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.4)] hover:ring-amber/40">
        <span className="mb-3.5 block">
          <Copyable value={subaccord.address} />
        </span>
        <dl className="gap-1.5 grid">
          <Stat label="Creator" value={<Copyable value={d.creator} />} />
          <Stat
            label="Staking token"
            value={<Copyable value={d.stakingToken} />}
          />
          <Stat label="Stakers" value={d.stakerCount.toString()} />
          <Stat label="Total stake" value={formatTokenAmount(d.totalStake)} />
        </dl>
      </Link>
    </StaggerItem>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}.</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function SubaccordGridSkeleton() {
  return (
    <ul className="list-none grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]" aria-busy aria-label="Loading subaccords">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="block rounded-lg bg-card p-4 ring-1 ring-foreground/10 transition-[box-shadow] hover:ring-amber/40 flex flex-col">
          <Skeleton
            className="rounded-sm bg-border"
            style={{ width: "60%", height: "1rem" }}
            aria-hidden
          />
          <Skeleton
            className="rounded-sm bg-border"
            style={{ width: "80%", height: "0.85rem", marginTop: "0.75rem" }}
            aria-hidden
          />
          <Skeleton
            className="rounded-sm bg-border"
            style={{ width: "50%", height: "0.85rem", marginTop: "0.4rem" }}
            aria-hidden
          />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  // BRAND.md voice — imperative, no hedging: "No subaccords yet." not "No results found."
  return (
    <div className="rounded-lg border border-dashed border-border p-12 text-center">
      <p className="mb-2 text-lg font-semibold">No subaccords yet.</p>
      <p className="mb-5 text-muted-foreground">
        Create the first pool. Stake jurors. File a dispute.
      </p>
      <Link to="/subaccords/new" className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]">
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
    <div className="rounded-lg border border-dashed border-border p-12 text-center">
      <p className="mb-2 text-lg font-semibold">Read failed.</p>
      <p className="mb-5 text-muted-foreground font-mono text-sm text-foreground">{message}</p>
      <button type="button" className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]" onClick={onRetry}>
        Retry.
      </button>
    </div>
  );
}
