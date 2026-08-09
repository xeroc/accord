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
    <main className="page">
      <header className="page-head">
        <Link to="/subaccords" className="back">
          ← Subaccords.
        </Link>
        <h1 className="title">
          <Copyable value={address} />
        </h1>
      </header>

      {isLoading ? (
        <DetailSkeleton />
      ) : isError ? (
        <div className="empty">
          <p className="empty-head">Read failed.</p>
          <p className="empty-body mono">
            {error instanceof Error ? error.message : "RPC error."}
          </p>
          <button type="button" className="cta" onClick={() => void refetch()}>
            Retry.
          </button>
        </div>
      ) : !data ? (
        <div className="empty">
          <p className="empty-head">No subaccord at this address.</p>
          <p className="empty-body">
            Check the address or create a new subaccord.
          </p>
          <Link to="/subaccords/new" className="cta">
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
      <nav className="actions">
        <Link to={`/juror/stake?subaccord=${address}`} className="cta">
          Stake as juror.
        </Link>
        <Link
          to={`/disputes/new?subaccord=${address}`}
          className="cta cta-ghost"
        >
          File a dispute.
        </Link>
      </nav>

      <section className="detail-grid">
        <Group head="Pool.">
          <Row
            label="Stakers"
            value={<span className="mono">{d.stakerCount}</span>}
          />
          <Row
            label="Total stake"
            value={
              <span className="mono">{formatTokenAmount(d.totalStake)}</span>
            }
          />
          <Row
            label="Next index"
            value={<span className="mono">{d.nextIndex}</span>}
          />
          <Row
            label="Tree depth"
            value={<span className="mono">{d.depth}</span>}
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
              <span className="mono">{formatTokenAmount(d.minStake)}</span>
            }
          />
          <Row
            label="Fee per juror"
            value={
              <span className="mono">{formatTokenAmount(d.feePerJuror)}</span>
            }
          />
          <Row
            label="Alpha"
            value={
              <span className="mono">
                {(d.alphaBps / 100).toFixed(2)}% ({d.alphaBps} bps)
              </span>
            }
          />
        </Group>

        <Group head="Windows.">
          <Row
            label="Review"
            value={<span className="mono">{formatWindow(d.reviewWindow)}</span>}
          />
          <Row
            label="Commit"
            value={<span className="mono">{formatWindow(d.commitWindow)}</span>}
          />
          <Row
            label="Reveal"
            value={<span className="mono">{formatWindow(d.revealWindow)}</span>}
          />
          <Row
            label="Appeal"
            value={<span className="mono">{formatWindow(d.appealWindow)}</span>}
          />
        </Group>

        <Group head="Panel.">
          <Row
            label="Max appeals"
            value={<span className="mono">{d.maxAppeals}</span>}
          />
          <Row
            label="Reveal threshold"
            value={
              <span className="mono">
                {(d.revealThresholdBps / 100).toFixed(2)}% (
                {d.revealThresholdBps} bps)
              </span>
            }
          />
          <Row
            label="Shortfall"
            value={<span className="mono">{d.shortfallPolicy}</span>}
          />
          <Row
            label="Max draw attempts"
            value={<span className="mono">{d.maxDrawAttempts}</span>}
          />
          <Row
            label="Aggregation"
            value={<span className="mono">{d.aggregation}</span>}
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
  if (value === zero) return <span className="muted">None (immutable).</span>;
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
    <div className="detail-group">
      <h2 className="section-head">{head}</h2>
      <dl className="rows">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row">
      <dt>{label}.</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="detail-grid" aria-busy aria-label="Loading subaccord">
      {Array.from({ length: 5 }).map((_, i) => (
        <div className="detail-group" key={i}>
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
