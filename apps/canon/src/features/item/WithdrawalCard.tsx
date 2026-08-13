/**
 * WithdrawalCard — the submitter's withdrawal surface for a CanonItem
 * (accord-etf5).
 *
 * Two modes, driven by item state (SPEC §Item state machine):
 *
 *  • `Listed` (+ connected wallet is the submitter) — shows the
 *    `request_withdrawal` button. Submitting transitions the item to
 *    `WithdrawPending` and opens the per-list `withdrawal_timelock` fraud-
 *    challenge window.
 *
 *  • `WithdrawPending` — read-only countdown to the timelock deadline. When it
 *    elapses the item becomes "withdrawable"; the actual stake return
 *    (`advance_withdrawal`) is a permissionless CRANK owned by the cranker
 *    (apps/cranker), NOT a button here. A challenge during the window
 *    re-enters the dispute path (handled by the challenge feature).
 *
 * Non-submitters / other states see only a muted, explanatory note.
 */

import { useEffect, useState } from "react";
import { type Account, type Address } from "@solana/kit";
import { requestWithdrawal, type CanonItem, type CanonList } from "@useaccord/canon";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useCanon } from "@/shared/rpc";
import { sendInstruction } from "@/shared/transaction";
import { describeError } from "@/shared/errors";
import { formatWindow, timeRemaining } from "@/shared/format";
import { Button } from "@/components/ui/button";
import {
  canRequestWithdrawal,
  isWithdrawPending,
  withdrawalDeadline,
} from "./withdrawal";

export function WithdrawalCard({
  item,
  list,
}: {
  item: Account<CanonItem>;
  list: Account<CanonList>;
}) {
  const env = useCanon();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  // Re-tick every second so the countdown stays live while the window is open.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isWithdrawPending(item.data)) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [item.data]);

  const connected: Address | null = env?.signer.address ?? null;
  const pending = isWithdrawPending(item.data);
  const canRequest = canRequestWithdrawal(item.data, connected);
  const windowLen = formatWindow(list.data.withdrawalTimelock);

  async function onRequest() {
    if (!env) return;
    setSending(true);
    try {
      const ix = requestWithdrawal({
        submitter: env.signer,
        list: item.data.list,
        item: item.address as Address,
      });
      await sendInstruction(env.rpc, env.rpcSubscriptions, env.signer, ix);
      toast.success("Withdrawal requested. Challenge window open.");
      void queryClient.invalidateQueries({
        queryKey: ["canon-item", item.address],
      });
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setSending(false);
    }
  }

  // --- WithdrawPending: read-only countdown (no action button) -----------
  if (pending) {
    const deadline = withdrawalDeadline(item.data, list.data);
    const remaining = deadline !== null ? timeRemaining(deadline) : "";
    const elapsed = remaining === "expired";
    return (
      <section className="detail-group">
        <h3 className="mono" style={{ color: "var(--amber)", marginBottom: "0.5rem" }}>
          Withdrawal pending
        </h3>
        <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.85rem" }}>
          Your stake is locked for the {windowLen} fraud-challenge window. It is
          returned once the timelock elapses — no further action from you.
        </p>
        <dl className="rows">
          <div className="row">
            <dt>Timelock</dt>
            <dd>{elapsed ? "elapsed — withdrawable" : remaining}</dd>
          </div>
          <div className="row">
            <dt>Settlement</dt>
            <dd className="muted">cranker (advance_withdrawal)</dd>
          </div>
        </dl>
        {elapsed && (
          <p className="muted" style={{ margin: "0.75rem 0 0", fontSize: "0.8rem" }}>
            A cranker will return your stake shortly. Anyone may trigger it.
          </p>
        )}
      </section>
    );
  }

  // --- Listed: the submitter may open the withdrawal window ---------------
  if (item.data.state !== undefined && canRequest) {
    return (
      <section className="detail-group">
        <h3 className="mono" style={{ color: "var(--amber)", marginBottom: "0.5rem" }}>
          Withdraw stake
        </h3>
        <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.85rem" }}>
          Opens a {windowLen} challenge window. Your accumulated stake is returned
          at the end if the item is not challenged.
        </p>
        <Button onClick={onRequest} disabled={sending}>
          {sending ? "Requesting…" : "Request withdrawal"}
        </Button>
      </section>
    );
  }

  // --- Listed but not the submitter: muted note --------------------------
  if (item.data.state !== undefined) {
    return (
      <section className="detail-group">
        <h3 className="mono" style={{ color: "var(--amber)", marginBottom: "0.5rem" }}>
          Withdraw stake
        </h3>
        <p className="muted" style={{ margin: "0", fontSize: "0.85rem" }}>
          Only the item submitter can request a withdrawal.
        </p>
      </section>
    );
  }

  return null;
}
