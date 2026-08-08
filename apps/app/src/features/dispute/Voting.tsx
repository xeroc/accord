import { useState } from "react";
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

import { useAccord } from "../../shared/rpc";
import { sendInstruction } from "../../shared/transaction";
import { shortAddress } from "../../shared/format";

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

  const inCommit = state === DisputeState.Commit;
  const inReveal = state === DisputeState.Reveal;

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
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
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
        <span className="font-mono text-xs text-text-secondary">
          {shortAddress(wallet, 4, 4)}
        </span>
      </div>

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

          {/* Commit phase */}
          {inCommit && !hasCommitted && (
            <div className="space-y-3">
              <label className="block font-mono text-sm text-text-secondary">
                Select option
              </label>
              <select
                value={vote}
                onChange={(e) => setVote(Number(e.target.value))}
                className="w-full rounded-md border border-border-subtle bg-ink px-3 py-2 font-mono text-sm text-text-primary focus:border-amber focus:outline-none"
              >
                {Array.from({ length: numOptions }, (_, i) => (
                  <option key={i} value={i}>
                    Option {i}
                  </option>
                ))}
              </select>
              <div className="break-all font-mono text-xs text-text-secondary">
                Option hash: {d.options[vote] ? hexBytes(d.options[vote]) : "—"}
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

          {inCommit && hasCommitted && (
            <p className="text-sm text-confirm">
              Vote committed. Reveal opens when the commit window closes.
            </p>
          )}

          {/* Reveal phase */}
          {inReveal && !hasRevealed && (
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

          {inReveal && hasRevealed && (
            <p className="text-sm text-confirm">Vote revealed.</p>
          )}

          {/* Neither commit nor reveal phase */}
          {!inCommit && !inReveal && (
            <p className="text-sm text-text-secondary">
              Voting is not open for this round.
            </p>
          )}

          {error && <p className="text-sm text-slash">{error}</p>}
        </>
      )}
    </div>
  );
}
