/**
 * JurorDetailPage — `/juror/:address` route.
 *
 * Inspect a single juror: every JurorStake across Subaccords (staked, active
 * draws, fees, pending withdrawal) and every SAS attestation binding the
 * wallet (ADR-0024) — credential, schema, signer, nonce, expiry, and the
 * gated subaccords each attestation unlocks. Gated pools the juror stakes in
 * without a satisfying attestation are flagged (they are `prune_juror`
 * targets once the attestation expires). The browse table links here; this
 * page is where the per-attestation detail lives.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { Account, Address } from "@solana/kit";
import {
  findAllSubaccords,
  findJurorStakesByJuror,
  findSasAttestations,
  type JurorStake,
  type Subaccord,
} from "@useaccord/sdk";

import { useClusterRpc } from "../../shared/rpc";
import { formatHash, formatTokenAmount } from "../../shared/format";
import {
  attachAttestations,
  expiryState,
  isGated,
  satisfiesGate,
  type AttachedAttestation,
  type CredentialBinding,
} from "./sas";
import {
  Badge,
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

export function JurorDetailPage() {
  const rpc = useClusterRpc()?.rpc ?? null;
  const { address = "" } = useParams<{ address: string }>();
  const juror = address as Address;

  const stakesQ = useQuery({
    queryKey: ["juror-stakes", juror, rpc],
    queryFn: () => findJurorStakesByJuror(rpc!, juror),
    enabled: Boolean(address) && Boolean(rpc),
    staleTime: 20_000,
  });

  const subaccordsQ = useQuery({
    queryKey: ["subaccords", rpc],
    queryFn: () => findAllSubaccords(rpc!),
    enabled: Boolean(rpc),
    staleTime: 30_000,
  });

  const attsQ = useQuery({
    queryKey: ["sas-attestations", juror, rpc],
    queryFn: () => findSasAttestations(rpc!, { wallet: juror }),
    enabled: Boolean(address) && Boolean(rpc),
    staleTime: 30_000,
  });

  const isLoading =
    stakesQ.isLoading || subaccordsQ.isLoading || attsQ.isLoading;
  const isError = stakesQ.isError || subaccordsQ.isError || attsQ.isError;
  const error = stakesQ.error ?? subaccordsQ.error ?? attsQ.error;

  const stakes = stakesQ.data ?? [];
  const subaccords = subaccordsQ.data ?? [];
  const attestations = attsQ.data ?? [];
  const attached = attachAttestations(attestations, subaccords);

  return (
    <>
      <header className="mb-8">
        <Link
          to="/juror/browse"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Jurors.
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.01em]">
          <Copyable value={address} head={10} tail={10} />
          {attached.length > 0 && (
            <span title="Holds SAS attestations">
              <span aria-hidden>🛡️</span>
              <span className="sr-only">SAS attested</span>
            </span>
          )}
        </h1>
        <p className="mb-4 text-muted-foreground">
          One juror, every stake, every credential. Amounts are raw token
          amounts grouped by mint.
        </p>
      </header>

      <Reveal
        state={
          isLoading
            ? "skeleton"
            : isError
              ? "error"
              : stakes.length === 0 && attached.length === 0
                ? "empty"
                : "content"
        }
      >
        {isLoading ? (
          <DetailSkeleton />
        ) : isError ? (
          <ErrorState
            message={
              error instanceof Error ? error.message : "RPC error."
            }
            onRetry={() => {
              void stakesQ.refetch();
              void subaccordsQ.refetch();
              void attsQ.refetch();
            }}
          />
        ) : stakes.length === 0 && attached.length === 0 ? (
          <EmptyState
            title="No juror at this address."
            description="No stakes and no SAS attestations bind this wallet."
            action={
              <Button asChild>
                <Link to="/juror/browse">Browse jurors.</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-8">
            <StakesSection stakes={stakes} subaccords={subaccords} attached={attached} />
            <AttestationsSection attached={attached} />
          </div>
        )}
      </Reveal>
    </>
  );
}

// --- stakes ---

function StakesSection({
  stakes,
  subaccords,
  attached,
}: {
  stakes: Account<JurorStake>[];
  subaccords: Account<Subaccord>[];
  attached: AttachedAttestation[];
}) {
  const bindingBySub = new Map<Address, CredentialBinding>();
  for (const sub of subaccords) {
    bindingBySub.set(sub.address, sub.data);
  }

  return (
    <section aria-label="Stakes">
      <h2 className="mb-3 text-lg font-semibold">Stakes.</h2>
      <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subaccord</TableHead>
              <TableHead className="w-28 text-center">Credential</TableHead>
              <TableHead className="text-right">Staked</TableHead>
              <TableHead className="w-28 text-right">Active draws</TableHead>
              <TableHead className="text-right">Fees earned</TableHead>
              <TableHead className="text-right">Pending withdrawal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stakes.map((s) => {
              const binding = bindingBySub.get(s.data.subaccord);
              const gated = binding !== undefined && isGated(binding);
              const shielded =
                binding !== undefined &&
                attached.some((a) => satisfiesGate(a.attestation, binding));
              return (
                <TableRow key={s.address}>
                  <TableCell>
                    <Link
                      to={`/subaccords/${s.data.subaccord}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      <Copyable value={s.data.subaccord} />
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    {!gated ? (
                      <span className="text-muted-foreground" aria-hidden>
                        —
                      </span>
                    ) : shielded ? (
                      <span title="SAS attestation satisfies this pool's gate">
                        <span aria-hidden>🛡️</span>
                        <span className="sr-only">SAS attested</span>
                      </span>
                    ) : (
                      <Badge variant="destructive" title="Gated pool with no satisfying SAS attestation — prune_juror target">
                        none
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatTokenAmount(s.data.staked)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {s.data.activeDraws}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatTokenAmount(s.data.feesEarned)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {s.data.pendingWithdrawal > 0n
                      ? formatTokenAmount(s.data.pendingWithdrawal)
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {stakes.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          No JurorStake accounts — this wallet has never staked.
        </p>
      )}
    </section>
  );
}

// --- attestations ---

function AttestationsSection({ attached }: { attached: AttachedAttestation[] }) {
  return (
    <section aria-label="SAS attestations">
      <h2 className="mb-3 text-lg font-semibold">
        SAS attestations.{" "}
        <span className="text-sm font-normal text-muted-foreground">
          Solana Attestation Service credentials binding this wallet.
        </span>
      </h2>
      {attached.length === 0 ? (
        <p className="rounded-lg bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
          No SAS attestation binds this wallet.
        </p>
      ) : (
        <ul className="list-none grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {attached.map(({ address, attestation, unlocks }) => (
            <AttestationCard
              key={address}
              address={address}
              attestation={attestation}
              unlocks={unlocks}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AttestationCard({
  address,
  attestation,
  unlocks,
}: {
  address: Address;
  attestation: AttachedAttestation["attestation"];
  unlocks: Address[];
}) {
  const state = expiryState(attestation.expiry, Date.now() / 1000);
  return (
    <li className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span title="SAS attestation account">
          <span aria-hidden>🛡️</span>
          <span className="sr-only">SAS attestation</span>{" "}
          <Copyable value={address} />
        </span>
        <ExpiryBadge state={state} />
      </div>
      <dl className="grid gap-1.5 text-sm">
        <Row label="Credential" value={<Copyable value={attestation.credential} />} />
        <Row label="Schema" value={<Copyable value={attestation.schema} />} />
        <Row label="Signer" value={<Copyable value={attestation.signer} />} />
        <Row label="Nonce" value={formatHash(attestation.nonce)} />
        <Row
          label="Expiry"
          value={
            attestation.expiry === 0n
              ? "Never expires"
              : new Date(Number(attestation.expiry) * 1000)
                  .toISOString()
                  .replace("T", " ")
                  .slice(0, 16) + " UTC"
          }
        />
        <Row
          label="Unlocks"
          value={
            unlocks.length > 0 ? (
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {unlocks.map((sub) => (
                  <Link
                    key={sub}
                    to={`/subaccords/${sub}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    <Copyable value={sub} />
                  </Link>
                ))}
              </span>
            ) : (
              <span className="text-muted-foreground">
                No matching gated subaccord
              </span>
            )
          }
        />
      </dl>
    </li>
  );
}

function ExpiryBadge({ state }: { state: "never" | "valid" | "expired" }) {
  if (state === "never") return <Badge variant="outline">never expires</Badge>;
  if (state === "valid") return <Badge variant="secondary">valid</Badge>;
  return <Badge variant="destructive">expired</Badge>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}.</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div
      className="rounded-lg bg-card p-4 ring-1 ring-foreground/10"
      aria-busy
      aria-label="Loading juror"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton
          key={i}
          className="rounded-sm bg-border"
          style={{
            width: `${85 - i * 7}%`,
            height: "0.85rem",
            marginBottom: "0.9rem",
          }}
          aria-hidden
        />
      ))}
    </div>
  );
}
