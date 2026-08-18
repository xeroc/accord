/**
 * Home — landing route (`/`) (accord-hvf9; canon HomePage shape).
 *
 * Left-biased hero (SYNOD lockup + Convene-a-case CTA), then:
 *  - "Cases awaiting you" inbox — connected wallet ∈ parties[], joined bit
 *    clear, Opening; sorted by join deadline; Join + evidence CTA into the
 *    case detail view (accord-o6nn owns the join flow itself).
 *  - Case browser — every SynodCase with state + roster fill.
 *
 * The SynodLogo mark lands with the branding task (accord-nwkd).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Account } from "@solana/kit";
import type { SynodCase } from "@useaccord/synod";

import { useClusterRpc } from "@/shared/rpc";
import { findAllSynodCases } from "@/shared/fetch";
import { useSigner } from "@/shared/wallet";
import { describeError } from "@/shared/errors";
import { formatAmount, formatTimestamp, shortenAddress } from "@/shared/format";
import { CASE_STATE_LABELS } from "@/features/case/caseDetail";
import { inboxCases, rosterFill } from "./homeInbox";

const PAGE_SIZE = 12;

export function HomePage() {
  const { signer } = useSigner();
  const rpc = useClusterRpc()?.rpc ?? null;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const {
    data: cases,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["synod-cases", rpc],
    queryFn: () => findAllSynodCases(rpc!),
    enabled: Boolean(rpc),
    staleTime: 30_000,
  });

  useEffect(() => setVisibleCount(PAGE_SIZE), [rpc]);

  const inbox = signer
    ? inboxCases(
        signer.address,
        (cases ?? []).map(({ address, data }) => ({ address, ...data })),
      )
    : [];
  const visible = (cases ?? []).slice(0, visibleCount);
  const hasMore = (cases?.length ?? 0) > visibleCount;

  return (
    <div className="space-y-10">
      <header className="flex flex-col items-start gap-3">
        <h1 className="font-mono text-3xl font-bold tracking-tight">SYNOD</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Convene the verdict. Name the parties, stake the pot — an honest jury
          decides who prevails.
        </p>
        <Link
          to="/cases/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]"
        >
          Convene a case.
        </Link>
      </header>

      {signer && (
        <section aria-label="Cases awaiting you">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
            Cases awaiting you.
          </h2>
          {inbox.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open case names you. When one does, join it here.
            </p>
          ) : (
            <ul className="grid list-none gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
              {inbox.map((c) => (
                <li key={c.address}>
                  <Link
                    to={`/cases/${c.address}`}
                    className="block rounded-lg bg-card p-4 ring-1 ring-foreground/10 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.4)] hover:ring-amber/40"
                  >
                    <p className="mb-1.5 font-mono text-sm">
                      {shortenAddress(c.address, 6)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.partyCount} parties · stake{" "}
                      {formatAmount(c.stake)} · join by{" "}
                      {formatTimestamp(c.joinDeadline)}
                    </p>
                    <p className="mt-2 text-xs text-amber">
                      Join + submit evidence →
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section aria-label="All cases">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
          Cases.
        </h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading cases…</p>
        ) : isError ? (
          <div className="text-sm">
            <p className="mb-2 text-destructive" role="alert">
              Could not load cases: {describeError(error)}
            </p>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => void refetch()}
            >
              Retry.
            </button>
          </div>
        ) : (cases?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cases on this cluster yet — convene the first.
          </p>
        ) : (
          <>
            <ul className="grid list-none gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
              {visible.map((c) => (
                <CaseCard key={c.address} card={c} />
              ))}
            </ul>
            <p className="mt-4 text-center text-[0.82rem] text-muted-foreground">
              Showing {visible.length} of {cases?.length}.
            </p>
            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]"
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                >
                  Load more.
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function CaseCard({ card }: { card: Account<SynodCase> }) {
  const c = card.data;
  return (
    <li>
      <Link
        to={`/cases/${card.address}`}
        className="block rounded-lg bg-card p-4 ring-1 ring-foreground/10 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.4)] hover:ring-amber/40"
      >
        <p className="mb-3.5 font-mono text-sm">
          {shortenAddress(card.address, 6)}
        </p>
        <dl className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">State.</dt>
            <dd className="text-right">{CASE_STATE_LABELS[c.state]}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">Roster.</dt>
            <dd className="text-right font-mono">
              {rosterFill({ joined: c.joined, partyCount: c.partyCount })}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">Stake.</dt>
            <dd className="text-right font-mono">{formatAmount(c.stake)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">Join by.</dt>
            <dd className="text-right">{formatTimestamp(c.joinDeadline)}</dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}
