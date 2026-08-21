/**
 * SubmitItemPage — `/lists/:address/submit` (accord-m2u2).
 *
 * The Item Submitter form (milestone §1 path (b)): submits a curated account
 * to a Canon list. Fields:
 *  - account   — the curated address (a PDA owned by `CanonList.list_program`)
 *  - deposit   — fee_mint deposit (defaults to the list's `submit_deposit`)
 *
 * Client-side validation (milestone §3): resolves the account's owner via RPC
 * and previews whether it matches `list.list_program` (skipped when the list
 * sets the sentinel — ownership check disabled). The on-chain check is
 * authoritative; this is a preview only.
 *
 * On submit, derives the submitter + vault ATAs, builds `submitItem`, sends it
 * (pre-flight sim → confirm), and navigates to the new item's detail page
 * (`Pending`). DoD: item → Pending.
 */

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { type Address } from "@solana/kit";
import { submitItem } from "@useaccord/canon";
import { toast } from "sonner";

import { useCanon, useClusterRpc } from "@/shared/rpc";
import { useCanonList } from "@/features/item/useCanonList";
import { sendInstruction } from "@/shared/transaction";
import { describeError } from "@/shared/errors";
import { getAtaAddress } from "@/shared/tokens";
import { ZERO_ADDRESS } from "@/shared/wallet";
import { formatTokenAmount, shortAddress } from "@/shared/format";
import {
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
} from "@useaccord/ui";
import { DomainDocPanel, hexIfSet } from "@/features/domain/DomainDocPanel";

export function SubmitItemPage() {
  const { address = "" } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const list = useCanonList(address);
  const env = useCanon();
  const crpc = useClusterRpc();

  const listData = list.data?.data;
  const ownershipDisabled = listData?.listProgram === ZERO_ADDRESS;

  const [account, setAccount] = useState("");
  const [deposit, setDeposit] = useState("");
  const [sending, setSending] = useState(false);

  // Default the deposit to the list's submit_deposit once loaded.
  const depositValue =
    deposit || (listData ? listData.submitDeposit.toString() : "");

  // Reactive owner preview (milestone §3: validate client-side where feasible).
  const ownerQuery = useQuery({
    queryKey: ["account-owner", account, crpc?.endpoint],
    queryFn: async () => {
      if (!account || !crpc) return null;
      const res = await crpc.rpc
        .getAccountInfo(account as Address, { encoding: "base64" })
        .send();
      return res.value ? (res.value.owner as Address) : null;
    },
    enabled: !!account && account.length > 30 && !!crpc && !ownershipDisabled,
    staleTime: 30_000,
  });

  const ownerMatch =
    ownerQuery.data !== undefined && !!listData
      ? ownerQuery.data === listData.listProgram
      : null;

  const ready = !!env && !!listData && account.length > 30;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!env || !listData) return;
    setSending(true);
    try {
      const feeMint = listData.feeMint;
      const submitterTokenAccount = await getAtaAddress(
        env.signer.address,
        feeMint,
      );
      const vault = await getAtaAddress(list.data!.address as Address, feeMint);
      const { instruction, item } = await submitItem(
        {
          submitter: env.signer,
          list: list.data!.address as Address,
          account: account as Address,
          feeMint,
          submitterTokenAccount,
          vault,
        },
        { deposit: BigInt(depositValue) },
      );
      await sendInstruction(
        env.rpc,
        env.rpcSubscriptions,
        env.signer,
        instruction,
      );
      toast.success("Item submitted — pending listing window.");
      navigate(`/items/${item}`);
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setSending(false);
    }
  }

  if (list.isLoading) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-10">
        <div
          className="animate-pulse rounded-sm bg-border"
          style={{ height: "1.5rem", width: "10rem" }}
        />
      </div>
    );
  }
  if (!list.data) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-10">
        <Link
          to="/"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back
        </Link>
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="mb-2 text-lg font-semibold">List not found</p>
          <p className="mb-5 text-muted-foreground">
            No CanonList at {shortAddress(address)}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-10">
      <Link
        to="/"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back
      </Link>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Submit item</h1>
        <p className="mb-4 text-muted-foreground font-mono text-sm text-foreground">to list {shortAddress(list.data.address)}</p>
      </div>

      {!env && (
        <p
          className="italic text-muted-foreground"
          style={{ marginBottom: "1rem" }}
        >
          Connect a wallet to submit.
        </p>
      )}

      {/* Rules document (ADR-0027): what submitters agree to */}
      {listData && (
        <div style={{ marginBottom: "1.5rem", maxWidth: "560px" }}>
          <DomainDocPanel hash={hexIfSet(listData.rulesHash)} />
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-7 rounded-lg bg-card p-4 ring-1 ring-foreground/10" style={{ maxWidth: "560px" }}>
        <Field>
          <FieldLabel>Account</FieldLabel>
          <FieldControl>
            <Input
              className="font-mono"
              placeholder="The curated address (base58)"
              value={account}
              onChange={(e) => setAccount(e.target.value.trim())}
            />
          </FieldControl>
          <FieldDescription>
            {ownershipDisabled
              ? "This list disables the ownership check (curates arbitrary data)."
              : `Must be owned by the list program (${shortAddress(listData!.listProgram)}).`}
          </FieldDescription>
          {!ownershipDisabled && ownerQuery.data !== undefined && (
            <span className={ownerMatch ? "text-xs text-success" : "text-xs text-destructive"}>
              {ownerMatch
                ? "✓ account owner matches the list program."
                : ownerQuery.data === null
                  ? "✗ account does not exist on-chain."
                  : "✗ owner mismatch — submit will revert."}
            </span>
          )}
        </Field>

        <Field>
          <FieldLabel>Deposit ({shortAddress(listData!.feeMint)})</FieldLabel>
          <FieldControl>
            <Input
              inputMode="numeric"
              value={depositValue}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </FieldControl>
          <FieldDescription>
            Locked permanently; recoverable only via withdrawal. Default{" "}
            {formatTokenAmount(listData!.submitDeposit)} (atomic).
          </FieldDescription>
        </Field>

        <Button type="submit" disabled={!ready} loading={sending}>
          {sending
            ? "Submitting…"
            : !env
              ? "Connect a wallet to submit."
              : "Submit item"}
        </Button>
      </form>
    </div>
  );
}
