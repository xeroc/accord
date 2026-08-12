import { useEffect, useState } from "react";
import {
  type Account,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  type Dispute,
  type Round,
  DisputeState,
  NO_VOTE,
} from "@useaccord/sdk";

import { Copyable } from "../../components/Copyable";
import { useAccord } from "../../shared/rpc";
import { sendInstruction } from "../../shared/transaction";
import { describeError } from "../../shared/errors";
import { timeRemaining } from "../../shared/format";
import { useManifest, optionLabels } from "./evidence";

// --- localStorage salt persistence (commit → reveal bridge) ---

const VOTE_KEY = "accord:vote";

interface StoredVote {
  vote: number;
  salt: number[];
}

function voteKey(dispute: string, roundIdx: number, juror: string): string {
  return `${VOTE_KEY}:${dispute}:${roundIdx}:${juror}`;
}

function loadStoredVote(
  key: string,
): { vote: number; salt: Uint8Array } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredVote;
    return { vote: parsed.vote, salt: new Uint8Array(parsed.salt) };
  } catch {
    return null;
  }
}

function saveStoredVote(key: string, vote: number, salt: Uint8Array): void {
  const data: StoredVote = { vote, salt: Array.from(salt) };
  localStorage.setItem(key, JSON.stringify(data));
}

// --- helpers ---

function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function isZeroHash(bytes: ReadonlyUint8Array): boolean {
  return bytes.every((b) => b === 0);
}

function hexBytes(bytes: ReadonlyUint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- live "now" (seconds) for countdowns; only ticks while enabled ---

function useNow(enabled: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!enabled) return;
    setNow(Math.floor(Date.now() / 1000));
    const id = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
}

// --- Component ---

export function Voting({
  dispute,
  round,
}: {
  dispute: Account<Dispute>;
  round: Account<Round>;
}) {
  const env = useAccord();
  const [vote, setVote] = useState(0);
  const [salt] = useState(() => randomSalt());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const d = dispute.data;
  const r = round.data;
  const state = d.state as DisputeState;
  const numOptions = d.numOptions;
  // Option labels from the evidence manifest (round 0 — options are fixed at
  // dispute creation). Absent label → fall back to the on-chain option hash.
  const { data: manifest } = useManifest(d.subaccord, dispute.address, 0);
  const manifestLabels = optionLabels(manifest);
  const wallet = env?.signer.address ?? "";

  // Check if connected wallet is a drawn juror
  const seatIdx = wallet
    ? r.jurors.slice(0, r.jurorCount).indexOf(wallet as Address)
    : -1;
  const isJuror = seatIdx >= 0;

  // Commit/reveal status for this juror's seat
  const hasCommitted =
    seatIdx >= 0 &&
    r.commits[seatIdx] !== undefined &&
    !isZeroHash(r.commits[seatIdx]);
  const hasRevealed = seatIdx >= 0 && r.reveals[seatIdx] !== NO_VOTE;

  // Stored vote for reveal (from this browser session)
  const stored = isJuror
    ? loadStoredVote(voteKey(dispute.address, r.roundIdx, wallet))
    : null;

  // Voting phases mirror the on-chain gates (lib.rs) — NOT the `state` field
  // alone. `state` lags: it only flips `Commit → Reveal` on the first reveal
  // or on the panel-full commit, so during the time-based reveal window (now
  // past commit_end, no reveals yet) `state` is still `Commit`. Drive the UI
  // off Clock time + commit_count so each form appears exactly when the chain
  // would accept the transaction.
  const commitPhase = state === DisputeState.Drawn || state === DisputeState.Commit;
  const revealPhase = state === DisputeState.Commit || state === DisputeState.Reveal;
  const allCommitted = r.commitCount === r.jurorCount;

  const reviewEnd = Number(r.reviewEnd);
  const commitEnd = Number(r.commitEnd);
  const revealEnd = Number(r.revealEnd);

  // Tick while any rendered window is live.
  const now = useNow(commitPhase || revealPhase);

  // Commit gate: review_end ≤ now < commit_end.
  const commitOpen = commitPhase && now >= reviewEnd && now < commitEnd;
  // Reveal gate (mirrors on-chain): state ∈ {Commit, Reveal}, now < reveal_end,
  // AND (now ≥ commit_end OR every juror committed — the early-reveal path).
  const revealOpen =
    revealPhase && now < revealEnd && (now >= commitEnd || allCommitted);
  // Panel drawn, but voting not yet open (review sub-window before reviewEnd).
  const reviewPending = commitPhase && now < reviewEnd;

  async function handleCommit() {
    if (!env || !isJuror) return;
    setError(null);
    setSending(true);
    try {
      saveStoredVote(voteKey(dispute.address, r.roundIdx, wallet), vote, salt);
      const { instruction } = await env.accord.methods.commit(
        {
          signer: env.signer.address,
          subaccord: d.subaccord,
          dispute: dispute.address,
          round: round.address,
        },
        { vote, salt },
      );
      await sendInstruction(
        env.rpc,
        env.rpcSubscriptions,
        env.signer,
        instruction,
      );
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  async function handleReveal() {
    if (!env) return;
    if (!stored) {
      setError(
        "No stored vote/salt — cannot reveal without the commit preimage.",
      );
      return;
    }
    setError(null);
    setSending(true);
    try {
      const instruction = env.accord.methods.reveal(
        {
          signer: env.signer.address,
          subaccord: d.subaccord,
          dispute: dispute.address,
          round: round.address,
        },
        { vote: stored.vote, salt: stored.salt },
      );
      await sendInstruction(
        env.rpc,
        env.rpcSubscriptions,
        env.signer,
        instruction,
      );
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  // --- Render ---

  if (!env) {
    return (
      <div className="rounded-lg border border-border-subtle bg-raised p-4">
        <h2 className="mb-2 font-mono text-sm text-text-secondary">Voting</h2>
        <p className="text-sm text-text-secondary">
          Connect a wallet to check juror eligibility and vote.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border-subtle bg-raised p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-sm text-text-secondary">Voting</h2>
        <Copyable value={wallet} />
      </div>

      {(reviewPending || commitOpen || revealOpen) && (
        <div
          className={`flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-xs ${
            reviewPending ? "border-border-subtle" : "border-amber/40 bg-amber/10"
          }`}
        >
          <span
            className={`font-medium ${reviewPending ? "text-text-secondary" : "text-amber"}`}
          >
            {reviewPending
              ? "Review phase"
              : commitOpen
                ? "Commit phase open"
                : "Reveal phase open"}
          </span>
          <span className="text-text-secondary">
            ·{" "}
            {reviewPending
              ? `voting opens in ${timeRemaining(reviewEnd, now) || "—"}`
              : `closes in ${timeRemaining(commitOpen ? commitEnd : revealEnd, now) || "—"}`}
          </span>
        </div>
      )}

      {!isJuror ? (
        <p className="text-sm text-text-secondary">
          You are not drawn into this round.
        </p>
      ) : (
        <>
          {/* Seat + status badges */}
          <div className="flex gap-4 font-mono text-xs text-text-secondary">
            <span>Seat {seatIdx}</span>
            <span className={hasCommitted ? "text-confirm" : ""}>
              {hasCommitted ? "✓ Committed" : "○ Not committed"}
            </span>
            <span className={hasRevealed ? "text-confirm" : ""}>
              {hasRevealed ? "✓ Revealed" : "○ Not revealed"}
            </span>
          </div>
          {/* Review sub-window: voting not yet open */}
          {reviewPending && (
            <p className="text-sm text-text-secondary">
              Voting opens in{" "}
              <span className="font-mono text-text-primary">
                {timeRemaining(reviewEnd, now) || "—"}
              </span>{" "}
              once the review window closes.
            </p>
          )}

          {/* Commit phase */}
          {commitOpen && !hasCommitted && (
            <div className="space-y-3">
              <label className="block font-mono text-sm text-text-secondary">
                Select option
              </label>
              <select
                value={vote}
                onChange={(e) => setVote(Number(e.target.value))}
                className="w-full rounded-md border border-border-subtle bg-ink px-3 py-2 font-mono text-sm text-text-primary focus:border-amber focus:outline-none"
              >
                {Array.from({ length: numOptions }, (_, i) => {
                  const label = manifestLabels[i]?.trim();
                  if (label) {
                    return (
                      <option key={i} value={i}>
                        {label}
                      </option>
                    );
                  }
                  const hash = d.options[i] ? hexBytes(d.options[i]) : "";
                  return (
                    <option key={i} value={i}>
                      {hash ? `${hash.slice(0, 12)}…` : `Option ${i}`}
                    </option>
                  );
                })}
              </select>
              <div className="break-all font-mono text-xs text-text-secondary">
                {manifestLabels[vote]?.trim()
                  ? `${manifestLabels[vote]} · `
                  : "option hash: "}
                {d.options[vote] ? hexBytes(d.options[vote]) : "—"}
              </div>
              <button
                onClick={handleCommit}
                disabled={sending}
                className="rounded-md bg-amber px-4 py-2 font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Signing…" : "Commit vote"}
              </button>
            </div>
          )}
          {commitOpen && hasCommitted && (
            <p className="text-sm text-confirm">
              Vote committed. Reveal opens once all jurors commit (or the commit window closes).
            </p>
          )}

          {/* Reveal phase */}
          {revealOpen && !hasRevealed && (
            <div className="space-y-3">
              {stored ? (
                <>
                  <p className="text-sm text-text-secondary">
                    Reveal vote{" "}
                    <span className="font-mono text-text-primary">
                      {stored.vote}
                    </span>{" "}
                    (stored at commit time).
                  </p>
                  <button
                    onClick={handleReveal}
                    disabled={sending}
                    className="rounded-md bg-amber px-4 py-2 font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? "Signing…" : "Reveal vote"}
                  </button>
                </>
              ) : (
                <p className="text-sm text-slash">
                  No stored salt for this dispute. The commit was made in
                  another session or wallet — reveal is not possible from here.
                </p>
              )}
            </div>
          )}

          {hasRevealed && (
            <p className="text-sm text-confirm">Vote revealed.</p>
          )}
          {/* Inactive: pending draw, post-reveal, or commit window missed */}
          {!commitOpen && !revealOpen && !reviewPending && !hasRevealed && (
            <p className="text-sm text-text-secondary">
              {(commitPhase || revealPhase) && now >= revealEnd
                ? "The voting window has closed for this round."
                : "Voting is not open for this round."}
            </p>
          )}

          {error && <p className="text-sm text-slash">{error}</p>}
        </>
      )}
    </div>
  );
}
