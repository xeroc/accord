import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isSome, type ReadonlyUint8Array } from "@solana/kit";
import { findAppealBondPda, findAccordStatePda } from "@useaccord/sdk";

import {
  DISPUTE_STATE_LABELS,
  formatRuling,
  timeRemaining,
} from "../../shared/format";
import { Copyable } from "../../components/Copyable";
import { useAccord } from "../../shared/rpc";
import { sendInstruction } from "../../shared/transaction";
import { describeError } from "../../shared/errors";
import { getAtaAddress } from "../../shared/tokens";
import { StateMachine } from "./StateMachine";
import { Voting } from "./Voting";
import { getAppealInfo } from "./useAppeal";
import { useAppealBond, useDispute, useRound } from "./useDispute";
import { useSubaccord } from "./useSubaccord";
import { PublishEvidence } from "./evidence/PublishEvidence";
import { EvidenceManifest } from "./evidence/EvidenceManifest";
import { useManifest } from "./evidence/useManifest";

const FINAL_SENTINEL = 255;

function hex(bytes: ReadonlyUint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatLamports(lamports: bigint): string {
  const sol = Number(lamports) / 1e9;
  return `${sol.toFixed(4)} SOL`;
}

function formatTimestamp(ts: bigint): string {
  if (ts === 0n) return "—";
  return new Date(Number(ts) * 1000).toLocaleString();
}

export function DisputeDetail() {
  const env = useAccord();
  const { address } = useParams<{ address: string }>();
  const { data: dispute, isLoading, error } = useDispute(address);
  const { data: round } = useRound(dispute ?? undefined);
  const { data: appealBond } = useAppealBond(dispute ?? undefined);
  const { data: subaccord } = useSubaccord(dispute?.data.subaccord);
  const { data: manifest } = useManifest(
    dispute?.data.subaccord,
    dispute?.address,
    0,
  );
  const [appealSending, setAppealSending] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);

  // Re-render every minute so the appeal-window countdown stays fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (isLoading) {
    return <p className="text-text-secondary">Loading dispute…</p>;
  }

  if (error) {
    return (
      <p className="text-slash">Failed to load dispute: {error.message}</p>
    );
  }

  if (!dispute) {
    return (
      <div>
        <p className="text-text-secondary">Dispute not found.</p>
        <Link
          to="/disputes"
          className="mt-4 inline-block text-amber hover:underline"
        >
          ← Back to disputes
        </Link>
      </div>
    );
  }

  const d = dispute.data;
  const isFinal = d.state === 6; // DisputeState.Final
  const isRoundResolved = d.state === 5; // DisputeState.RoundResolved
  const roundResult = round?.data.result ?? FINAL_SENTINEL;
  const hasRoundResult = isRoundResolved && roundResult !== FINAL_SENTINEL;

  async function handleAppeal() {
    if (!env || !dispute || !round || !subaccord) return;
    setAppealError(null);
    setAppealSending(true);
    try {
      // AppealBond PDA is keyed by the round BEING appealed (current_round,
      // before the increment) — must match the on-chain seeds in the Appeal
      // account struct: seeds = [SEED_APPEAL_BOND, dispute, current_round].
      // Passing current_round+1 here caused ConstraintSeeds (2006).
      const [appealBondPda] = await findAppealBondPda({
        dispute: dispute.address,
        roundIdx: dispute.data.currentRound,
      });
      const [accordState] = await findAccordStatePda();
      const feeToken = subaccord.data.feeToken;
      const feeVault = await getAtaAddress(subaccord.address, feeToken);
      const appellantTokenAccount = await getAtaAddress(
        env.signer.address,
        feeToken,
      );
      const instruction = env.accord.methods.appeal(
        {
          appellant: env.signer.address,
          subaccord: subaccord.address,
          accordState,
          dispute: dispute.address,
          round: round.address,
          appealBond: appealBondPda,
          feeToken,
          appellantTokenAccount,
          feeVault,
        },
        new Uint8Array(32), // [0u8;32] sentinel — no new evidence this round
      );
      await sendInstruction(
        env.rpc,
        env.rpcSubscriptions,
        env.signer,
        instruction,
      );
    } catch (err) {
      setAppealError(describeError(err));
    } finally {
      setAppealSending(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/disputes"
          className="font-mono text-sm text-text-secondary hover:text-text-primary"
        >
          ← All disputes
        </Link>
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-semibold">
          Dispute <Copyable value={dispute.address} head={6} tail={6} />
        </h1>
      </div>

      {/* State machine */}
      <div className="rounded-lg border border-border-subtle bg-raised p-4">
        <h2 className="mb-3 font-mono text-sm text-text-secondary">
          Lifecycle
        </h2>
        <StateMachine current={d.state} />
      </div>

      {/* Dispute info */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border-subtle bg-raised p-4">
        <InfoRow
          label="Filer"
          value={<Copyable value={d.filer} head={6} tail={6} />}
        />
        <InfoRow
          label="Subaccord"
          value={
            <Link
              to={`/subaccords/${d.subaccord}`}
              className="text-amber hover:underline"
            >
              <Copyable value={d.subaccord} head={6} tail={6} />
            </Link>
          }
        />
        <InfoRow label="State" value={DISPUTE_STATE_LABELS[d.state]} />
        <InfoRow label="Current round" value={`${d.currentRound}`} mono />
        <InfoRow label="Fee paid" value={formatLamports(d.feePaid)} mono />
        <InfoRow
          label="VRF"
          value={isSome(d.committedVrf) ? "Committed" : "Pending"}
        />
        <InfoRow
          label="Frozen root"
          value={
            d.frozenRoot.every((b) => b === 0) ? (
              "—"
            ) : (
              <Copyable value={hex(d.frozenRoot)} />
            )
          }
        />
        <InfoRow label="Filed at" value={formatTimestamp(d.filedAt)} />
      </div>

      {/* Options */}
      <div className="rounded-lg border border-border-subtle bg-raised p-4">
        <h2 className="mb-3 font-mono text-sm text-text-secondary">
          Options ({d.numOptions})
        </h2>
        <div className="space-y-2">
          {(() => {
            // Tally revealed votes per option (round resolved or final).
            const tally = new Map<number, number>();
            if (round && (isRoundResolved || isFinal)) {
              for (const v of round.data.reveals) {
                if (v !== FINAL_SENTINEL && v < d.numOptions) {
                  tally.set(v, (tally.get(v) ?? 0) + 1);
                }
              }
            }
            const showTally = tally.size > 0;
            return d.options.slice(0, d.numOptions).map((opt, idx) => {
              const isWinner = isFinal && d.finalRuling === idx;
              const isRoundWinner = hasRoundResult && roundResult === idx;
              const votes = tally.get(idx) ?? 0;
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-3 rounded border px-3 py-2 ${
                    isWinner
                      ? "border-amber bg-amber/10"
                      : isRoundWinner
                        ? "border-confirm bg-confirm/10"
                        : "border-border-subtle"
                  }`}
                >
                  <span className="font-mono text-sm text-text-secondary">
                    {idx}
                  </span>
                  <Copyable value={hex(opt)} />
                  {isWinner && (
                    <span className="font-mono text-sm text-amber">
                      ← Verdict
                    </span>
                  )}
                  {isRoundWinner && (
                    <span className="font-mono text-sm text-confirm">
                      ← Won round {d.currentRound}
                    </span>
                  )}
                  {showTally && (
                    <span
                      className={`ml-auto font-mono text-xs ${
                        isWinner
                          ? "text-amber/70"
                          : isRoundWinner
                            ? "text-confirm/70"
                            : "text-text-secondary"
                      }`}
                    >
                      {votes} vote{votes === 1 ? "" : "s"}
                    </span>
                  )}
                  {isRoundWinner && (
                    <button
                      type="button"
                      onClick={() =>
                        document
                          .getElementById("appeal")
                          ?.scrollIntoView({ behavior: "smooth" })
                      }
                      className="font-mono text-xs text-text-secondary hover:text-confirm"
                    >
                      appeal ↓
                    </button>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Evidence (per round — ADR-0023) */}
      {/* evidenceHashes is a fixed [0..=MAX_APPEALS] slot array; slot 0 = filer,
          each appeal may write the next slot. [0u8;32] sentinel = no new evidence
          that round (jurors reuse prior rounds'). Only slots up to the current
          round are relevant; future slots are zero by initialization. */}
      {(() => {
        const slots = d.evidenceHashes.slice(0, d.currentRound + 1);
        const filed = slots.filter(
          (h) => !h.every((b: number) => b === 0),
        ).length;
        return (
          <div className="rounded-lg border border-border-subtle bg-raised p-4">
            <h2 className="mb-3 font-mono text-sm text-text-secondary">
              Evidence ({filed} new package{filed === 1 ? "" : "s"} through
              round {d.currentRound})
            </h2>
            <div className="space-y-2">
              {slots.map((h, round) => {
                const isSentinel = h.every((b: number) => b === 0);
                return (
                  <div
                    key={round}
                    className="flex items-center gap-3 rounded border border-border-subtle px-3 py-2"
                  >
                    <span className="w-16 shrink-0 font-mono text-xs text-text-secondary">
                      round {round}
                    </span>
                    {isSentinel ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        no new evidence — reuses prior rounds
                      </span>
                    ) : (
                      <Copyable value={hex(h)} head={8} tail={6} />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              Round-N jurors receive every non-zero package from rounds 0..=N.
            </p>
          </div>
        );
      })()}

      {/* Evidence manifest — decrypted, public. Fetched from the evidence
          daemon so jurors and the public can inspect the dispute metadata. */}
      <EvidenceManifest
        subaccord={d.subaccord}
        dispute={dispute.address}
        round={0}
      />

      {/* Publish evidence (recovery) — only shown while no manifest has been
          published to the daemon for round 0 yet. useManifest shares the query
          cache with EvidenceManifest above (same queryKey), so this adds no
          extra fetch. PublishEvidence still hash-gates on evidenceHashes[0]. */}
      {subaccord && manifest === null && (
        <PublishEvidence dispute={dispute} subaccord={subaccord} />
      )}

      {/* Final ruling */}
      {isFinal && d.finalRuling !== FINAL_SENTINEL && (
        <div className="rounded-lg border border-amber bg-amber/10 p-4">
          <h2 className="mb-1 font-mono text-sm text-amber">Final ruling</h2>
          <p className="text-lg">Option {d.finalRuling}</p>
          <p className="mt-1 text-sm text-text-secondary">
            Finalized at {formatTimestamp(d.finalizedAt)}
          </p>
        </div>
      )}

      {/* Round info */}
      {round && (
        <div className="rounded-lg border border-border-subtle bg-raised p-4">
          <h2 className="mb-3 font-mono text-sm text-text-secondary">
            Round {round.data.roundIdx}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="Jurors" value={`${round.data.jurorCount}`} mono />
            <InfoRow
              label="Commits"
              value={`${round.data.commitCount}/${round.data.jurorCount}`}
              mono
            />
            <InfoRow
              label="Reveals"
              value={`${round.data.revealCount}/${round.data.jurorCount}`}
              mono
            />
            <InfoRow
              label="Review ends"
              value={formatTimestamp(round.data.reviewEnd)}
            />
            <InfoRow
              label="Commit ends"
              value={formatTimestamp(round.data.commitEnd)}
            />
            <InfoRow
              label="Reveal ends"
              value={formatTimestamp(round.data.revealEnd)}
            />
          </div>
          {round.data.jurors.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 font-mono text-xs text-text-secondary">
                Drawn jurors
              </h3>
              <div className="flex flex-wrap gap-2">
                {round.data.jurors.map((juror, idx) => (
                  <Copyable key={idx} value={juror} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Appeal bond info */}
      {appealBond && (
        <div className="rounded-lg border border-border-subtle bg-raised p-4">
          <h2 className="mb-3 font-mono text-sm text-text-secondary">
            Appeal bond
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <InfoRow
              label="Appellant"
              value={
                <Copyable value={appealBond.data.appellant} head={6} tail={6} />
              }
            />
            <InfoRow
              label="Amount"
              value={formatLamports(appealBond.data.amount)}
              mono
            />
            <InfoRow
              label="Prior result"
              value={formatRuling(appealBond.data.priorResult)}
              mono
            />
          </div>
        </div>
      )}

      {/* Appeal action */}
      {isRoundResolved &&
        (() => {
          const appealWindowEnd = round
            ? round.data.revealEnd + d.terms.appealWindow
            : undefined;
          const remaining =
            appealWindowEnd !== undefined
              ? timeRemaining(Number(appealWindowEnd))
              : "";
          const info = getAppealInfo(dispute, appealWindowEnd);
          if (!info) return null;
          return (
            <div
              id="appeal"
              className="rounded-lg border border-border-subtle bg-raised p-4 scroll-mt-4"
            >
              <h2 className="mb-2 font-mono text-sm text-text-secondary">
                Appeal
              </h2>
              {/* Round result + appeal-window countdown */}
              {hasRoundResult && (
                <div className="mb-4 rounded border border-confirm/30 bg-confirm/5 px-3 py-2">
                  <p className="text-sm">
                    Round {d.currentRound} resolved to{" "}
                    <span className="font-mono text-confirm">
                      Option {roundResult}
                    </span>
                    .
                  </p>
                  {remaining && remaining !== "expired" && (
                    <p className="mt-1 font-mono text-xs text-text-secondary">
                      {remaining} left to appeal
                    </p>
                  )}
                </div>
              )}
              {info.eligible ? (
                <>
                  <p className="mb-3 text-sm text-text-secondary">
                    Escalate to round {info.newRound} with a {info.panel}-juror
                    panel.
                  </p>
                  <div className="mb-4 grid grid-cols-2 gap-4">
                    <InfoRow
                      label="New fee"
                      value={formatLamports(info.fee)}
                      mono
                    />
                    <InfoRow
                      label="Bond"
                      value={formatLamports(info.bond)}
                      mono
                    />
                    <InfoRow
                      label="Total cost"
                      value={formatLamports(info.total)}
                      mono
                    />
                    {appealWindowEnd !== undefined && (
                      <InfoRow
                        label="Window closes"
                        value={formatTimestamp(appealWindowEnd)}
                      />
                    )}
                  </div>
                  {/* Appeal tx: SDK facade → sendInstruction. The ConnectorKit
                      signer comes from useAccord(). */}
                  {appealError && (
                    <p className="mb-3 text-sm text-slash">{appealError}</p>
                  )}
                  <button
                    onClick={handleAppeal}
                    disabled={!env || !subaccord || appealSending}
                    className="rounded-md bg-amber px-4 py-2 font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {!env
                      ? "Appeal — connect wallet"
                      : appealSending
                        ? "Signing…"
                        : "Appeal"}
                  </button>
                </>
              ) : (
                <p className="text-sm text-slash">{info.reason}</p>
              )}
            </div>
          );
        })()}

      {/* Commit/reveal voting (inline — accord-7mkb) */}
      {round && round.data.jurorCount > 0 && (
        <Voting dispute={dispute} round={round} />
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-xs text-text-secondary">{label}</dt>
      <dd className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
