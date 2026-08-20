import { Link } from "react-router-dom";

import {
  Button,
  Copyable,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@useaccord/ui";
import { DISPUTE_STATE_LABELS, formatRuling } from "../../shared/format";
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
        <Button asChild className="mt-4">
          <Link to="/disputes/new">File a dispute.</Link>
        </Button>
      </div>
    );
  }

  return (
    <Table className="w-full border-collapse">
      <TableHeader>
        <TableRow className="border-b border-border-subtle text-left">
          {["Address", "Filer", "Subaccord", "State", "Round", "Ruling"].map(
            (h) => (
              <TableHead
                key={h}
                scope="col"
                className="py-2 pr-4 font-mono text-sm text-text-secondary"
              >
                {h}
              </TableHead>
            ),
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {disputes.map((d) => (
          <TableRow
            key={d.address}
            className="border-b border-border-subtle transition-colors hover:bg-raised"
          >
            <TableCell className="py-2 pr-4">
              <Link
                to={`/disputes/${d.address}`}
                className="text-amber hover:underline"
              >
                <Copyable value={d.address} />
              </Link>
            </TableCell>
            <TableCell className="py-2 pr-4">
              <Copyable value={d.data.filer} />
            </TableCell>
            <TableCell className="py-2 pr-4">
              <Copyable value={d.data.subaccord} />
            </TableCell>
            <TableCell className="py-2 pr-4 text-sm">
              {DISPUTE_STATE_LABELS[d.data.state]}
            </TableCell>
            <TableCell className="py-2 pr-4 font-mono text-sm">
              {d.data.currentRound}
            </TableCell>
            <TableCell className="py-2 pr-4 font-mono text-sm">
              {formatRuling(d.data.finalRuling, d.data.terms.aggregation)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
