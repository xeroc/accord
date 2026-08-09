import { Link } from "react-router-dom";

import { DISPUTE_STATE_LABELS, formatRuling } from "../../shared/format";
import { Copyable } from "../../components/Copyable";
import { useDisputes } from "./useDisputes";

export function DisputeList() {
  const { data: disputes, isLoading, error } = useDisputes();

  if (isLoading) {
    return <p className="text-text-secondary">Loading disputes…</p>;
  }

  if (error) {
    return (
      <p className="text-slash">Failed to load disputes: {error.message}</p>
    );
  }

  if (!disputes || disputes.length === 0) {
    return (
      <div>
        <p className="text-text-secondary">No disputes found.</p>
        <Link
          to="/disputes/new"
          className="mt-4 inline-block rounded-md bg-amber px-4 py-2 font-medium text-ink"
        >
          File a dispute.
        </Link>
      </div>
    );
  }

  return (
    <div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border-subtle text-left">
            <th className="py-2 pr-4 font-mono text-sm text-text-secondary">
              Address
            </th>
            <th className="py-2 pr-4 font-mono text-sm text-text-secondary">
              Filer
            </th>
            <th className="py-2 pr-4 font-mono text-sm text-text-secondary">
              Subaccord
            </th>
            <th className="py-2 pr-4 font-mono text-sm text-text-secondary">
              State
            </th>
            <th className="py-2 pr-4 font-mono text-sm text-text-secondary">
              Round
            </th>
            <th className="py-2 pr-4 font-mono text-sm text-text-secondary">
              Ruling
            </th>
          </tr>
        </thead>
        <tbody>
          {disputes.map((d) => (
            <tr
              key={d.address}
              className="border-b border-border-subtle transition-colors hover:bg-raised"
            >
              <td className="py-2 pr-4">
                <Link
                  to={`/disputes/${d.address}`}
                  className="text-amber hover:underline"
                >
                  <Copyable value={d.address} />
                </Link>
              </td>
              <td className="py-2 pr-4">
                <Copyable value={d.data.filer} />
              </td>
              <td className="py-2 pr-4">
                <Copyable value={d.data.subaccord} />
              </td>
              <td className="py-2 pr-4 text-sm">
                {DISPUTE_STATE_LABELS[d.data.state]}
              </td>
              <td className="py-2 pr-4 font-mono text-sm">
                {d.data.currentRound}
              </td>
              <td className="py-2 pr-4 font-mono text-sm">
                {formatRuling(d.data.finalRuling)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
