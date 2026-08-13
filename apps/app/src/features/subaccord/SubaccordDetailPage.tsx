/**
 * Subaccord detail view (accord-rgn6).
 *
 * `/subaccords/:address` — reads one Subaccord via the typed decoder
 * (`fetchSubaccord(rpc, address)`), shows every on-chain param, and links to
 * the stake + dispute flows with the address as a query param. Read-only — no
 * wallet needed. Hashes/addresses/numbers render in IBM Plex Mono (`.mono`).
 *
 * The full account struct is shown (the bean lists the headline fields; the
 * ADR-0020/0021 additions — feeToken, appealWindow, revealThresholdBps,
 * maxDrawAttempts — are included so the view matches the code, per
 * docs-match-reality).
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { Address, ReadonlyUint8Array } from "@solana/kit";

import { useClusterRpc } from "../../shared/rpc";
import { fetchSubaccord, type SubaccordView } from "../../shared/fetch";
import { formatTokenAmount, formatWindow } from "../../shared/format";
import { Copyable } from "../../components/Copyable";
import { Skeleton } from "../../components/Skeleton";

export function SubaccordDetailPage() {
  const rpc = useClusterRpc()?.rpc ?? null;
  const { address = "" } = useParams<{ address: string }>();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["subaccord", address, rpc],
    queryFn: () => fetchSubaccord(rpc!, address as Address),
    enabled: Boolean(address) && Boolean(rpc),
    staleTime: 30_000,
  });

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10">
      <header className="mb-8">
        <Link to="/subaccords" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Subaccords.
        </Link>
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.01em]">
          <Copyable value={address} />
        </h1>
      </header>

      {isLoading ? (
        <DetailSkeleton />
      ) : isError ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="mb-2 text-lg font-semibold">Read failed.</p>
          <p className="mb-5 text-muted-foreground font-mono text-sm text-foreground">
            {error instanceof Error ? error.message : "RPC error."}
          </p>
          <button type="button" className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]" onClick={() => void refetch()}>
            Retry.
          </button>
        </div>
      ) : !data ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="mb-2 text-lg font-semibold">No subaccord at this address.</p>
          <p className="mb-5 text-muted-foreground">
            Check the address or create a new subaccord.
          </p>
          <Link to="/subaccords/new" className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]">
            Create a subaccord.
          </Link>
        </div>
      ) : (
        <SubaccordDetail address={address} subaccord={data} />
      )}
    </main>
  );
}

function SubaccordDetail({
  address,
  subaccord: d,
}: {
  address: string;
  subaccord: SubaccordView;
}) {
  return (
    <>
      <nav className="mb-8 flex flex-wrap gap-3">
        <Link to={`/juror/stake?subaccord=${address}`} className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]">
          Stake as juror.
        </Link>
        <Link
          to={`/disputes/new?subaccord=${address}`}
          className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96] inline-flex items-center justify-center rounded-md bg-transparent px-3.5 py-2 text-sm font-semibold text-primary ring-1 ring-inset ring-primary transition-[background-color,scale] hover:bg-primary/10 active:scale-[0.96]"
        >
          File a dispute.
        </Link>
      </nav>

      <section className="gap-4 grid [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
        <Group head="Pool.">
          <Row
            label="Stakers"
            value={<span className="font-mono text-sm text-foreground">{d.stakerCount}</span>}
          />
          <Row
            label="Total stake"
            value={
              <span className="font-mono text-sm text-foreground">{formatTokenAmount(d.totalStake)}</span>
            }
          />
          <Row
            label="Next index"
            value={<span className="font-mono text-sm text-foreground">{d.nextIndex}</span>}
          />
          <Row
            label="Tree depth"
            value={<span className="font-mono text-sm text-foreground">{d.depth}</span>}
          />
          <Row
            label="Root hash"
            value={<Copyable value={fullHex(d.rootHash)} />}
          />
        </Group>

        <Group head="Tokens.">
          <Row
            label="Staking token"
            value={<Copyable value={d.stakingToken} />}
          />
          <Row label="Fee token" value={<Copyable value={d.feeToken} />} />
          <Row
            label="Min stake"
            value={
              <span className="font-mono text-sm text-foreground">{formatTokenAmount(d.minStake)}</span>
            }
          />
          <Row
            label="Fee per juror"
            value={
              <span className="font-mono text-sm text-foreground">{formatTokenAmount(d.feePerJuror)}</span>
            }
          />
          <Row
            label="Alpha"
            value={
              <span className="font-mono text-sm text-foreground">
                {(d.alphaBps / 100).toFixed(2)}% ({d.alphaBps} bps)
              </span>
            }
          />
        </Group>

        <Group head="Windows.">
          <Row
            label="Review"
            value={<span className="font-mono text-sm text-foreground">{formatWindow(d.reviewWindow)}</span>}
          />
          <Row
            label="Commit"
            value={<span className="font-mono text-sm text-foreground">{formatWindow(d.commitWindow)}</span>}
          />
          <Row
            label="Reveal"
            value={<span className="font-mono text-sm text-foreground">{formatWindow(d.revealWindow)}</span>}
          />
          <Row
            label="Appeal"
            value={<span className="font-mono text-sm text-foreground">{formatWindow(d.appealWindow)}</span>}
          />
        </Group>

        <Group head="Panel.">
          <Row
            label="Max appeals"
            value={<span className="font-mono text-sm text-foreground">{d.maxAppeals}</span>}
          />
          <Row
            label="Reveal threshold"
            value={
              <span className="font-mono text-sm text-foreground">
                {(d.revealThresholdBps / 100).toFixed(2)}% (
                {d.revealThresholdBps} bps)
              </span>
            }
          />
          <Row
            label="Shortfall"
            value={<span className="font-mono text-sm text-foreground">{d.shortfallPolicy}</span>}
          />
          <Row
            label="Max draw attempts"
            value={<span className="font-mono text-sm text-foreground">{d.maxDrawAttempts}</span>}
          />
          <Row
            label="Aggregation"
            value={<span className="font-mono text-sm text-foreground">{d.aggregation}</span>}
          />
        </Group>

        <Group head="Identity.">
          <Row label="Creator" value={<Copyable value={d.creator} />} />
          <Row label="Authority" value={<Authority value={d.authority} />} />
          <Row
            label="Evidence operator"
            value={<Authority value={d.evidenceOperator} />}
          />
          <Row
            label="Risk type"
            value={<Copyable value={fullHex(d.riskType)} />}
          />
          <Row
            label="Evidence spec"
            value={<Copyable value={fullHex(d.evidenceSpec)} />}
          />
        </Group>
      </section>
    </>
  );
}

function Authority({ value }: { value: Address }) {
  const zero = "11111111111111111111111111111111";
  if (value === zero) return <span className="italic text-muted-foreground">None (immutable).</span>;
  return <Copyable value={value} />;
}

function Group({
  head,
  children,
}: {
  head: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">{head}</h2>
      <dl className="gap-2 grid">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}.</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="gap-4 grid [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]" aria-busy aria-label="Loading subaccord">
      {Array.from({ length: 5 }).map((_, i) => (
        <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10" key={i}>
          <Skeleton style={{ width: "40%", height: "0.8rem" }} />
          {Array.from({ length: 4 }).map((_, j) => (
            <Skeleton
              key={j}
              style={{ width: "90%", height: "0.85rem", marginTop: "0.6rem" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Full lowercase hex of a 32-byte hash (for the `title` tooltip). */
function fullHex(bytes: Uint8Array | ReadonlyUint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
