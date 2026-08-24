/**
 * RetunePanel — the list authority's retuning surface (accord-gou8 / ADR
 * canon/0003). Rendered by ListDetailPage ONLY when the connected wallet is
 * `CanonList.authority` (see `canUpdateList`).
 *
 * Two sections (no Tabs primitive in @useaccord/ui — sections, not tabs):
 *  1. List parameters — `update_list`, instant (no timelock). Prefilled with
 *     the on-chain values; submit invalidates the list query so the fresh
 *     values render immediately.
 *  2. Court parameters — `propose_court_update` (CPI; the CanonList PDA signs
 *     as the court authority, this wallet pays rent) → 48h Accord timelock →
 *     the permissionless Accord `execute_subaccord_update`, driven directly
 *     here (no canon wrapper). Field+value picker reuses the create-list
 *     court semantics via `parseCourtUpdateValue` (retune.ts); the Authority
 *     variant and the immutable min_jury_size/depth are never offered.
 */
import { useState, type FormEvent } from "react";
import {
  type Account,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
} from "@solana/kit";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CanonList } from "@useaccord/canon";
import { updateList, proposeCourtUpdate } from "@useaccord/canon";
import { Accord, getPendingUpdateDecoder } from "@useaccord/sdk";
import { Button } from "@useaccord/ui";
import { Field } from "./CreateListPage";

import { useClusterRpc } from "@/shared/rpc";
import { sendInstruction } from "@/shared/transaction";
import { describeError } from "@/shared/errors";
import { formatWindow } from "@/shared/format";
import {
  COURT_UPDATE_FIELDS,
  parseCourtUpdateValue,
  timelockSecondsLeft,
  type CourtUpdateField,
} from "./retune";
async function readExecuteAfterSlot(
  rpc: Rpc<SolanaRpcApi>,
  pendingUpdate: Address,
): Promise<bigint | null> {
  const res = await rpc
    .getAccountInfo(pendingUpdate, { encoding: "base64" })
    .send();
  if (!res.value) return null;
  // atob, not kit's base64 codec: the workspace-sourced SDK runs its own kit
  // instance whose branded types don't unify with the app's (see onPropose).
  const bin = atob(res.value.data[0]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return getPendingUpdateDecoder().decode(bytes as never).executeAfterSlot;
}

export function RetunePanel({
  list,
  signer,
}: {
  list: Account<CanonList>;
  /** The connected wallet — guaranteed non-null by the caller's gate. */
  signer: TransactionSigner;
}) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold tracking-[-0.01em]">
        Retune.{" "}
        <span className="italic text-muted-foreground">
          (list authority — you)
        </span>
      </h2>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <ListParamsForm list={list} signer={signer} />
        <CourtUpdateForm list={list} signer={signer} />
      </div>
    </section>
  );
}

// --- List parameters (update_list — instant) ----------------------------------

function ListParamsForm({
  list,
  signer,
}: {
  list: Account<CanonList>;
  signer: TransactionSigner;
}) {
  const crpc = useClusterRpc();
  const queryClient = useQueryClient();
  const d = list.data;
  const [submitDeposit, setSubmitDeposit] = useState(d.submitDeposit.toString());
  const [challengePct, setChallengePct] = useState(d.challengePct.toString());
  const [listingWindow, setListingWindow] = useState(d.listingWindow.toString());
  const [withdrawalTimelock, setWithdrawalTimelock] = useState(
    d.withdrawalTimelock.toString(),
  );
  const [newAuthority, setNewAuthority] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!crpc) return;
    setError(null);
    setSending(true);
    try {
      const instruction = updateList(
        { authority: signer, list: list.address },
        {
          submitDeposit: BigInt(submitDeposit),
          challengePct: Number(challengePct),
          listingWindow: BigInt(listingWindow),
          withdrawalTimelock: BigInt(withdrawalTimelock),
          // Empty ⇒ SDK passes the zero-address sentinel ⇒ no rotation.
          newAuthority: (newAuthority.trim() || undefined) as Address | undefined,
        },
      );
      await sendInstruction(crpc.rpc, crpc.rpcSubscriptions, signer, instruction);
      toast.success("List parameters updated — effective immediately.");
      await queryClient.invalidateQueries({ queryKey: ["canon-list"] });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="grid gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10"
    >
      <p className="text-sm text-muted-foreground">
        List parameters — instant, no timelock.
      </p>
      <Field
        label="Submit deposit"
        value={submitDeposit}
        onChange={(v) => setSubmitDeposit(v)}
      />
      <Field
        label="Challenge pct (bps)"
        value={challengePct}
        onChange={(v) => setChallengePct(v)}
      />
      <Field
        label="Listing window (seconds)"
        value={listingWindow}
        onChange={(v) => setListingWindow(v)}
      />
      <Field
        label="Withdrawal timelock (seconds)"
        value={withdrawalTimelock}
        onChange={(v) => setWithdrawalTimelock(v)}
      />
      <Field
        label="New authority (optional)"
        value={newAuthority}
        onChange={(v) => setNewAuthority(v)}
        placeholder="leave empty to keep"
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" disabled={sending}>
        {sending ? "Updating…" : "Update list parameters."}
      </Button>
    </form>
  );
}

// --- Court parameters (propose_court_update → 48h → execute) -------------------

function CourtUpdateForm({
  list,
  signer,
}: {
  list: Account<CanonList>;
  signer: TransactionSigner;
}) {
  const crpc = useClusterRpc();
  const queryClient = useQueryClient();
  const [field, setField] = useState<CourtUpdateField>(COURT_UPDATE_FIELDS[0]!);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Post-propose state: the armed PendingUpdate + its timelock ETA.
  const [pending, setPending] = useState<{
    pendingUpdate: Address;
    executeAfterSlot: bigint;
  } | null>(null);
  const [currentSlot, setCurrentSlot] = useState<bigint | null>(null);

  const executeReady =
    pending !== null && currentSlot !== null && currentSlot >= pending.executeAfterSlot;

  async function onPropose() {
    if (!crpc) return;
    setError(null);
    let payload;
    try {
      payload = parseCourtUpdateValue(field.kind, value);
    } catch (e) {
      setError(describeError(e));
      return;
    }
    setSending(true);
    try {
      // Caller-chosen nonce: ms timestamp is unique per UI session; the PDA
      // init rejects collisions anyway.
      const nonce = BigInt(Date.now());
      const { instruction, pendingUpdate } = await proposeCourtUpdate(
        { caller: signer, list: list.address, subaccord: list.data.subaccord },
        { nonce, payload },
      );
      await sendInstruction(crpc.rpc, crpc.rpcSubscriptions, signer, instruction);
      // Read the timelock ETA back directly (page RPC + generated decoder).
      // NOT via `new Accord(...).methods` — the workspace-sourced SDK runs a
      // second kit instance whose Codama client rejects the page's RPC proxy
      // ("rpc.getAccountInfo is not a function").
      const executeAfterSlot = await readExecuteAfterSlot(
        crpc.rpc,
        pendingUpdate,
      );
      if (executeAfterSlot === null)
        throw new Error("PendingUpdate not found after propose confirmed.");
      setPending({ pendingUpdate, executeAfterSlot });
      setCurrentSlot(null);
      toast.success("Court update proposed. 48h timelock armed.");
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSending(false);
    }
  }

  async function onExecute() {
    if (!crpc || !pending) return;
    setError(null);
    setSending(true);
    try {
      // Permissionless Accord execute — no canon wrapper by design.
      const accord = new Accord({ endpoint: crpc.endpoint, signer });
      const instruction = accord.methods.executeSubaccordUpdate(
        signer.address,
        list.data.subaccord,
        pending.pendingUpdate,
      );
      await sendInstruction(crpc.rpc, crpc.rpcSubscriptions, signer, instruction);
      setPending(null);
      setValue("");
      toast.success("Court update executed.");
      await queryClient.invalidateQueries({ queryKey: ["canon-court"] });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSending(false);
    }
  }

  /** Poll the current slot on demand — the execute gate is the on-chain slot. */
  async function refreshSlot() {
    if (!crpc || !pending) return;
    try {
      const slot = await crpc.rpc.getSlot({ commitment: "confirmed" }).send();
      setCurrentSlot(slot);
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <div className="grid content-start gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">
        Court parameters — propose, 48h timelock, then execute. min jury size
        and tree depth are irreversible; the court authority is pinned.
      </p>
      <div className="grid gap-1.5">
        <label htmlFor="court-field" className="text-sm font-medium leading-none">
          Field.
        </label>
        <select
          id="court-field"
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          value={field.kind}
          onChange={(e) =>
            setField(COURT_UPDATE_FIELDS.find((f) => f.kind === e.target.value)!)
          }
        >
          {COURT_UPDATE_FIELDS.map((f) => (
            <option key={f.kind} value={f.kind}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <Field
        label="New value"
        value={value}
        onChange={(v) => setValue(v)}
        placeholder={field.hint}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button onClick={() => void onPropose()} disabled={sending || pending !== null}>
        {sending ? "Proposing…" : "Propose court update."}
      </Button>

      {pending && (
        <div className="rounded-md border border-border p-3 text-sm">
          <p>
            Proposed — executable at slot{" "}
            <span className="font-mono">{pending.executeAfterSlot.toString()}</span>.
          </p>
          <p className="text-muted-foreground">
            {currentSlot !== null
              ? timelockSecondsLeft(pending.executeAfterSlot, currentSlot) > 0
                ? `~${formatWindow(
                    BigInt(
                      Math.ceil(
                        timelockSecondsLeft(pending.executeAfterSlot, currentSlot),
                      ),
                    ),
                  )} remaining (slot ${currentSlot}).`
                : "Timelock elapsed — ready to execute."
              : "Refresh to check the current slot."}
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void refreshSlot()}>
              Refresh slot.
            </Button>
            <Button
              size="sm"
              disabled={sending || !executeReady}
              onClick={() => void onExecute()}
            >
              Execute update.
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
