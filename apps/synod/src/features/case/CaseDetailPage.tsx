/**
 * Case detail (accord-9aoc): dispute status card + manual escape-hatch
 * buttons. The roster + state machine + join-with-evidence view is accord-o6nn;
 * this page carries what the escape hatches need.
 *
 * Read path: `SynodCase` → bound Accord `Dispute` (`case.dispute`) → hosting
 * `Subaccord` (fee token) → recovered case-open nonce (`SynodCase` stores no
 * seed backrefs — SPEC §Instructions #3 — so `recoverCaseNonce` re-probes the
 * `["case", opener, nonce]` PDA).
 *
 * Manual buttons (permissionless on-chain; gated here to the connected
 * wallet's own share where the destination ATA identifies the party):
 *   - file_dispute — Opening + full roster (anyone)
 *   - claim — Live + dispute Final/Failed, signer a party with its payout due
 *   - refund_roster_miss — Opening + deadline passed + partial roster, signer
 *     a joined-unpaid party
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Account, Address } from "@solana/kit";
import {
  DisputeState,
  fetchMaybeDispute,
  fetchSubaccordMaybe,
  findAccordStatePda,
  findAssociatedTokenAddress,
  type Dispute,
  type Subaccord,
} from "@useaccord/sdk";
import {
  CaseState,
  claim,
  fetchMaybeSynodCase,
  fileDispute,
  findBoundDisputePda,
  findCaseVaultPda,
  refundRosterMiss,
  type SynodCase,
} from "@useaccord/synod";

import { useClusterRpc, useSynod } from "@/shared/rpc";
import { describeError } from "@/shared/errors";
import { useSigner, ZERO_ADDRESS } from "@/shared/wallet";
import { shortenAddress, formatAmount, formatTimestamp } from "@/shared/format";
import {
  CASE_STATE_LABELS,
  bitSet,
  resolveCaseActions,
  payoutPreview,
  recoverCaseNonce,
} from "./caseDetail";
import { DisputeStatusCard } from "./DisputeStatusCard";

export function CaseDetailPage() {
  const { address: caseAddrRaw } = useParams();
  const caseAddr = caseAddrRaw as Address | undefined;
  const { signer } = useSigner();
  const crpc = useClusterRpc();
  const queryClient = useQueryClient();
  const env = useSynod();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<"file" | "claim" | "refund" | null>(
    null,
  );

  const caseQuery = useQuery({
    queryKey: ["synod-case", caseAddr, crpc?.endpoint],
    enabled: !!caseAddr && !!crpc,
    queryFn: async (): Promise<Account<SynodCase> | null> => {
      const maybe = await fetchMaybeSynodCase(crpc!.rpc, caseAddr!);
      return maybe.exists ? (maybe as Account<SynodCase>) : null;
    },
  });

  const c = caseQuery.data?.data;

  const subQuery = useQuery({
    queryKey: ["synod-case-subaccord", c?.subaccord, crpc?.endpoint],
    enabled: !!c && !!crpc,
    queryFn: async (): Promise<Subaccord | null> => {
      const maybe = await fetchSubaccordMaybe(crpc!.rpc, c!.subaccord);
      return maybe.exists ? maybe.data : null;
    },
  });

  const disputeBound = !!c && c.dispute !== ZERO_ADDRESS;
  const disputeQuery = useQuery({
    queryKey: ["synod-case-dispute", c?.dispute, crpc?.endpoint],
    enabled: disputeBound && !!crpc,
    queryFn: async (): Promise<Account<Dispute> | null> => {
      const maybe = await fetchMaybeDispute(crpc!.rpc, c!.dispute);
      return maybe.exists ? (maybe as Account<Dispute>) : null;
    },
    staleTime: 15_000,
  });

  // Nonce recovery — pure PDA probe over (opener, candidate) pairs.
  const nonceQuery = useQuery({
    queryKey: ["synod-case-nonce", c?.parties[0], caseAddr],
    enabled: !!c && !!caseAddr,
    queryFn: () => recoverCaseNonce(c!.parties[0]!, caseAddr!),
  });

  if (!caseAddr || !crpc) {
    return (
      <main className="mx-auto max-w-[1100px] px-6 py-10 text-muted-foreground">
        No RPC cluster active.
      </main>
    );
  }
  if (caseQuery.isLoading) {
    return (
      <main className="mx-auto max-w-[1100px] px-6 py-10 text-muted-foreground">
        Loading case…
      </main>
    );
  }
  if (!c) {
    return (
      <main className="mx-auto max-w-[1100px] px-6 py-10">
        <p className="mb-4 text-lg font-semibold">Case not found.</p>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back.
        </Link>
      </main>
    );
  }

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const dispute = disputeQuery.data;
  const disputeState = dispute?.data.state ?? null;
  const actions = resolveCaseActions(c, disputeState, nowSec);
  const payout = payoutPreview(c, dispute?.data ?? null);
  const nonce = nonceQuery.data ?? null;

  const myIndex = signer
    ? c.parties.findIndex((p, i) => i < c.partyCount && p === signer.address)
    : -1;
  const myJoined = myIndex >= 0 && bitSet(c.joined, myIndex);
  const myPaid = myIndex >= 0 && bitSet(c.paidOut, myIndex);
  const canClaim = actions.claim && myIndex >= 0 && !myPaid;
  const canRefund = actions.refund && myJoined && !myPaid;
  const canFile = actions.file;
  const hatchReady = !!signer && !!subQuery.data && nonce !== null;

  const optionLabels = c.parties
    .slice(0, c.partyCount)
    .map((p) => shortenAddress(p, 4))
    .concat("No party prevails");

  async function run(action: "file" | "claim" | "refund") {
    setError(null);
    if (!signer || !crpc || !env || !c || !subQuery.data || nonce === null)
      return;
    setSending(action);
    try {
      const opener = c.parties[0]!;
      const casePda = caseAddr!;
      const feeMint = subQuery.data.feeToken;
      const vault = await findCaseVaultPda(feeMint, casePda);
      let instruction;
      if (action === "file") {
        const [accordDispute] = await findBoundDisputePda(casePda);
        const [accordState] = await findAccordStatePda();
        const accordFeeVault = await findAssociatedTokenAddress(
          feeMint,
          c.subaccord,
        );
        instruction = await fileDispute(
          {
            caller: signer,
            opener,
            case: casePda,
            subaccord: c.subaccord,
            feeMint,
            vault,
          },
          { nonce },
          { accordDispute, accordState, accordFeeVault },
        );
      } else {
        const partyTokenAccount = await findAssociatedTokenAddress(
          feeMint,
          signer.address,
        );
        instruction =
          action === "claim"
            ? await claim(
                {
                  caller: signer,
                  opener,
            case: casePda,
                  dispute: c.dispute,
                  subaccord: c.subaccord,
                  feeMint,
                  partyTokenAccount,
                  vault,
                },
                { nonce },
              )
            : await refundRosterMiss(
                {
                  caller: signer,
                  opener,
            case: casePda,
                  subaccord: c.subaccord,
                  feeMint,
                  partyTokenAccount,
                  vault,
                },
                { nonce },
              );
      }
      await env.sendIx(instruction);
      toast.success(
        action === "file"
          ? "Dispute filed — the court is live."
          : action === "claim"
            ? "Payout claimed."
            : "Stake refunded.",
      );
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSending(null);
    }
  }

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10">
      <header className="mb-8">
        <h1 className="font-mono text-[1.4rem] font-semibold tracking-[-0.01em]">
          {shortenAddress(caseAddr, 8)}
        </h1>
        <p className="mb-4 text-muted-foreground">
          {CASE_STATE_LABELS[c.state]} · {c.partyCount} parties · stake{" "}
          {formatAmount(c.stake)} · frozen fee {formatAmount(c.fee)}
        </p>
        <p className="text-xs text-muted-foreground">
          Join deadline {formatTimestamp(c.joinDeadline)}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
            Roster.
          </h2>
          <ul className="grid gap-2">
            {c.parties.slice(0, c.partyCount).map((p, i) => (
              <li
                key={`${p}-${i}`}
                className="flex items-center justify-between gap-3 font-mono text-sm"
              >
                <span className={i === myIndex ? "text-amber" : ""}>
                  {i + 1}. {shortenAddress(p, 6)}
                  {i === 0 ? " (opener)" : ""}
                  {i === myIndex ? " (you)" : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {bitSet(c.paidOut, i)
                    ? "paid"
                    : bitSet(c.joined, i)
                      ? "joined"
                      : "invited"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {disputeBound && dispute ? (
          <DisputeStatusCard dispute={dispute} optionLabels={optionLabels} />
        ) : (
          <section className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
            No dispute bound yet — the roster completes, then anyone may file.
          </section>
        )}
      </div>

      {(canFile || canClaim || canRefund) && (
        <section className="mt-6 rounded-lg border border-border p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
            Escape hatches.
          </h2>
          {!signer && (
            <p className="mb-3 text-sm text-muted-foreground">
              Connect a wallet to act.
            </p>
          )}
          {signer && nonce === null && (
            <p className="mb-3 text-xs text-destructive" role="alert">
              Could not recover the case nonce (sequential scan exhausted) —
              this case was opened with an out-of-band nonce.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {canFile && (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50"
                disabled={!hatchReady || sending !== null}
                onClick={() => run("file")}
              >
                {sending === "file" ? "Signing…" : "File dispute."}
              </button>
            )}
            {canClaim && (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50"
                disabled={!hatchReady || sending !== null}
                onClick={() => run("claim")}
              >
                {sending === "claim" ? "Signing…" : "Claim your share."}
              </button>
            )}
            {canRefund && (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-border px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                disabled={!hatchReady || sending !== null}
                onClick={() => run("refund")}
              >
                {sending === "refund" ? "Signing…" : "Pull your stake back."}
              </button>
            )}
          </div>
          {canClaim && payout.kind === "winner" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Ruling favors party {payout.partyIndex + 1} — the winner pulls{" "}
              {formatAmount(payout.amount)}.
            </p>
          )}
          {canClaim && payout.kind === "neutral" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Neutral ruling — each party pulls {formatAmount(payout.share)}; the
              last claimant drains the {formatAmount(payout.remainder)} remainder.
            </p>
          )}
          {canClaim && payout.kind === "failed" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Dispute failed — every party pulls its full{" "}
              {formatAmount(payout.amount)} back.
            </p>
          )}
        </section>
      )}

      {error && (
        <p className="mt-4 font-mono text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
