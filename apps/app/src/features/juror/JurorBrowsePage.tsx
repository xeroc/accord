/**
 * JurorBrowsePage — `/juror/browse` route.
 *
 * Simple table of every active juror (staked > 0) across all Subaccords.
 * Fetches all Subaccords + all JurorStakes + all SAS attestations, joins them
 * to resolve per-mint amounts, and groups by juror wallet. Rows link to the
 * per-juror detail page (`/juror/:address`); jurors holding an SAS attestation
 * that satisfies the gate of a subaccord they stake in carry the 🛡️ shield
 * (ADR-0024) — full attestation details live on the detail page.
 *
 * Different Subaccords may use different collateral and fee mints (ADR-0020),
 * so raw amounts are grouped by mint — never summed across mints. Each mint
 * line shows the mint address (copyable) alongside the raw token amount.
 *
 * The SAS scan is non-fatal: on clusters where it errors the shield column
 * renders empty rather than failing the whole table.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { type Account, type Address } from "@solana/kit";
import {
  findAllJurorStakes,
  findAllSubaccords,
  findSasAttestations,
  type JurorStake,
  type SasAttestation,
  type Subaccord,
} from "@useaccord/sdk";

import { useClusterRpc } from "../../shared/rpc";
import { formatTokenAmount } from "../../shared/format";
import { isShieldedJuror, type AttestationRef } from "./sas";
import {
  Button,
  Copyable,
  EmptyState,
  ErrorState,
  Reveal,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@useaccord/ui";

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
  shielded: boolean;
}

// --- pure aggregation ---

function aggregateJurors(
  stakes: Account<JurorStake>[],
  subaccords: Account<Subaccord>[],
  attestations: AttestationRef[],
): JurorSummary[] {
  // subaccord → { staking mint, fee mint, gate binding }
  const subByAddress = new Map<
    Address,
    {
      staking: Address;
      fee: Address;
      jurorCredential: Address;
      jurorSchema: Address;
    }
  >();
  for (const sub of subaccords) {
    subByAddress.set(sub.address, {
      staking: sub.data.stakingToken,
      fee: sub.data.feeToken,
      jurorCredential: sub.data.jurorCredential,
      jurorSchema: sub.data.jurorSchema,
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
    const stakeBindings: { jurorCredential: Address; jurorSchema: Address }[] =
      [];

    for (const s of jurorStakes) {
      subaccordSet.add(s.data.subaccord);
      activeDraws += s.data.activeDraws;

      const sub = subByAddress.get(s.data.subaccord);
      if (sub) {
        stakeBindings.push(sub);
        stakedMap.set(
          sub.staking,
          (stakedMap.get(sub.staking) ?? 0n) + s.data.staked,
        );
        if (s.data.feesEarned > 0n) {
          feesMap.set(
            sub.fee,
            (feesMap.get(sub.fee) ?? 0n) + s.data.feesEarned,
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
      shielded: isShieldedJuror(juror, attestations, stakeBindings),
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

  const attsQ = useQuery({
    queryKey: ["sas-attestations-all", rpc],
    queryFn: () => findSasAttestations(rpc!),
    enabled: Boolean(rpc),
    staleTime: 30_000,
  });

  const isLoading = subaccordsQ.isLoading || stakesQ.isLoading;
  const isError = subaccordsQ.isError || stakesQ.isError;
  const error = subaccordsQ.error ?? stakesQ.error;

  const jurors =
    subaccordsQ.data && stakesQ.data
      ? aggregateJurors(stakesQ.data, subaccordsQ.data, attsQ.data ?? [])
      : [];

  return (
    <>
      <header className="mb-8">
        <Link to="/juror" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Juror dashboard.
        </Link>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Jurors.</h1>
        <p className="mb-4 text-muted-foreground">
          Every active juror across all subaccords. Staked amounts are grouped
          by mint — different pools may use different collateral. The shield 🛡️
          marks jurors holding an SAS attestation for a gated pool they stake
          in.
        </p>
      </header>

      <Reveal state={isLoading ? "skeleton" : isError ? "error" : jurors.length > 0 ? "content" : "empty"}>
        {isLoading ? (
          <JurorTableSkeleton />
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
          <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Juror</TableHead>
                  <TableHead className="w-24 text-center">Credential</TableHead>
                  <TableHead className="w-24 text-right">Subaccords</TableHead>
                  <TableHead className="w-28 text-right">Active draws</TableHead>
                  <TableHead className="text-right">Staked</TableHead>
                  <TableHead className="text-right">Fees earned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jurors.map((juror) => (
                  <JurorRow key={juror.address} juror={juror} />
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            title="No active jurors."
            description="No one is staked yet. Stake collateral in a subaccord to appear here."
            action={
              <Button asChild>
                <Link to="/subaccords">Browse subaccords.</Link>
              </Button>
            }
          />
        )}
      </Reveal>
      {attsQ.isError && (
        <p className="mt-3 text-sm text-muted-foreground">
          SAS attestations unavailable on this cluster — shields hidden.
        </p>
      )}
    </>
  );
}

function JurorRow({ juror }: { juror: JurorSummary }) {
  return (
    <TableRow className="transition-colors hover:bg-muted/40">
      <TableCell>
        <Link
          to={`/juror/${juror.address}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          <Copyable value={juror.address} />
        </Link>
      </TableCell>
      <TableCell className="text-center">
        {juror.shielded ? (
          <span title="Holds an SAS attestation for a gated subaccord">
            <span aria-hidden>🛡️</span>
            <span className="sr-only">SAS attested</span>
          </span>
        ) : (
          <span className="text-muted-foreground" aria-hidden>
            —
          </span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono">
        {juror.subaccords.length}
      </TableCell>
      <TableCell className="text-right font-mono">
        {juror.activeDraws}
      </TableCell>
      <TableCell className="text-right">
        <MintAmounts amounts={juror.stakedByMint} />
      </TableCell>
      <TableCell className="text-right">
        <MintAmounts amounts={juror.feesByMint} />
      </TableCell>
    </TableRow>
  );
}

function MintAmounts({ amounts }: { amounts: MintAmount[] }) {
  if (amounts.length === 0) {
    return (
      <span className="text-muted-foreground" aria-hidden>
        —
      </span>
    );
  }
  return (
    <span className="grid gap-0.5">
      {amounts.map((entry) => (
        <span
          key={entry.mint}
          className="flex items-center justify-end gap-2"
        >
          <span className="text-muted-foreground">
            <Copyable value={entry.mint} />
          </span>
          <span className="font-mono">{formatTokenAmount(entry.amount)}</span>
        </span>
      ))}
    </span>
  );
}

function JurorTableSkeleton() {
  return (
    <div
      className="rounded-lg bg-card p-4 ring-1 ring-foreground/10"
      aria-busy
      aria-label="Loading jurors"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton
          key={i}
          className="rounded-sm bg-border"
          style={{
            width: `${90 - i * 8}%`,
            height: "0.85rem",
            marginBottom: "0.9rem",
          }}
          aria-hidden
        />
      ))}
    </div>
  );
}
