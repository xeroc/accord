/**
 * UpdateParametersCard — the authority's parameter-update surface
 * (accord-7s0n / ADR-0028).
 *
 * Gated by `canUpdateSubaccord` (connected wallet == Subaccord authority,
 * non-sentinel): non-authority wallets never see it. The flow is the
 * timelocked pair from SPEC §Instructions #2:
 *
 *  1. Propose — pick one mutable field + value (domain-validated exactly like
 *     the create form, `update.ts`), sign, land a `PendingUpdate`.
 *  2. Wait — read `executeAfterSlot` back and surface the ~48h countdown.
 *  3. Execute — permissionless; shown to the authority for UX once the slot
 *     passes. Applying closes the PendingUpdate and refreshes the detail view.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Address, TransactionSigner } from "@solana/kit";
import { Accord } from "@useaccord/sdk";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field as UiField,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@useaccord/ui";

import { useClusterRpc } from "../../shared/rpc";
import { sendInstruction } from "../../shared/transaction";
import { describeError } from "../../shared/errors";
import { formatWindow } from "../../shared/format";
import type { SubaccordView } from "../../shared/fetch";
import {
  parseUpdateValue,
  timelockSecondsLeft,
  UPDATE_FIELDS,
  type UpdateField,
} from "./update";

export function UpdateParametersCard({
  subaccord,
  data,
  signer,
}: {
  subaccord: Address;
  data: SubaccordView;
  /** The connected wallet — guaranteed non-null by the caller's gate. */
  signer: TransactionSigner;
}) {
  const crpc = useClusterRpc();
  const queryClient = useQueryClient();
  const [field, setField] = useState<UpdateField>(UPDATE_FIELDS[0]!);
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
    if (!crpc || !signer) return;
    setError(null);
    let payload;
    try {
      payload = parseUpdateValue(field.kind, value, data.aggregation);
    } catch (e) {
      setError(describeError(e));
      return;
    }
    setSending(true);
    try {
      const accord = new Accord({ endpoint: crpc.endpoint, signer });
      // Caller-chosen nonce (ADR-0005): ms timestamp is unique per proposal
      // in a UI session; the PDA init rejects collisions anyway.
      const nonce = BigInt(Date.now());
      const { instruction, pendingUpdate } =
        await accord.methods.proposeSubaccordUpdate(
          signer.address,
          subaccord,
          nonce,
          payload,
        );
      await sendInstruction(crpc.rpc, crpc.rpcSubscriptions, signer, instruction);
      const executeAfterSlot =
        await accord.methods.getUpdateExecuteAfterSlot(pendingUpdate);
      if (executeAfterSlot === null)
        throw new Error("PendingUpdate not found after propose confirmed.");
      setPending({ pendingUpdate, executeAfterSlot });
      toast.success("Update proposed. 48h timelock armed.");
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSending(false);
    }
  }

  async function onExecute() {
    if (!crpc || !signer || !pending) return;
    setError(null);
    setSending(true);
    try {
      const accord = new Accord({ endpoint: crpc.endpoint, signer });
      const instruction = accord.methods.executeSubaccordUpdate(
        signer.address,
        subaccord,
        pending.pendingUpdate,
      );
      await sendInstruction(crpc.rpc, crpc.rpcSubscriptions, signer, instruction);
      setPending(null);
      setValue("");
      toast.success("Update executed.");
      await queryClient.invalidateQueries({ queryKey: ["subaccord"] });
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
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Update parameters.</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update subaccord parameters</DialogTitle>
          <DialogDescription>
            One field per proposal. Execution is behind the on-chain 48h
            timelock (UPDATE_TIMELOCK_SLOTS) — stakers can exit before it
            lands.
          </DialogDescription>
        </DialogHeader>

        {!pending ? (
          <>
            <UiField>
              <FieldLabel>Field.</FieldLabel>
              <FieldControl>
                <Select
                  value={field.kind}
                  onValueChange={(v) => {
                    const f = UPDATE_FIELDS.find((x) => x.kind === v);
                    if (f) setField(f);
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Field">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UPDATE_FIELDS.map((f) => (
                      <SelectItem key={f.kind} value={f.kind}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldControl>
              <FieldDescription>{field.hint}</FieldDescription>
            </UiField>
            <UiField>
              <FieldLabel>New value.</FieldLabel>
              <FieldControl>
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={field.hint}
                  aria-label="New value"
                />
              </FieldControl>
            </UiField>
            {error && <p className="text-sm text-slash">{error}</p>}
            <Button
              onClick={() => void onPropose()}
              disabled={sending || !value.trim()}
            >
              {sending ? "Proposing…" : "Propose update."}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Proposed. Executable once slot{" "}
              <span className="font-mono text-foreground">
                {pending.executeAfterSlot.toLocaleString()}
              </span>{" "}
              passes
              {currentSlot !== null && !executeReady
                ? ` — ~${formatWindow(BigInt(Math.max(0, Math.ceil(timelockSecondsLeft(pending.executeAfterSlot, currentSlot)))))} left`
                : "."}
            </p>
            {error && <p className="text-sm text-slash">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void refreshSlot()}>
                Check timelock.
              </Button>
              <Button
                onClick={() => void onExecute()}
                disabled={sending || !executeReady}
              >
                {executeReady ? "Execute update." : "Timelock active."}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
