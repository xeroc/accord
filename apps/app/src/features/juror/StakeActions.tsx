/**
 * StakeActions — the per-stake management panel.
 *
 * Renders against one decoded JurorStake and exposes every action a juror
 * can take on their capital:
 *
 *   stake more          — add collateral (needs MST proof)
 *   request withdraw    — phase 1 of two-phase withdraw (needs MST proof)
 *   withdraw            — phase 2: claim pending_withdrawal after delay
 *   reconcile           — fold settlement_delta into canonical stake (needs proof)
 *   withdraw fees       — pull aggregate fees_earned (ADR-0020, no gate)
 *
 * Each action is a small inline form. Proof-needing actions share one
 * `useStakingProof` result. The panel is read-mostly until the user picks
 * an action — keeps the dashboard scannable.
 */
import { useState } from "react";
import {
  type Account,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import {
  Accord,
  type JurorStake,
  type MSTNode,
  type Subaccord,
  findJurorStakePda,
  findAccordStatePda,
} from "@useaccord/sdk";
import { toast } from "sonner";

import { useClusterRpc } from "../../shared/rpc";
import { useSigner } from "../../shared/wallet";
import { sendInstruction } from "../../shared/transaction";
import { describeError } from "../../shared/errors";
import { getAtaAddress } from "../../shared/tokens";
import { formatTokenAmount } from "../../shared/format";
import {
  Button,
  Copyable,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
} from "@useaccord/ui";
import { useSubaccord } from "../dispute/useSubaccord";
import { useStakingProof } from "./useStakingProof";

type Action =
  | "none"
  | "stake"
  | "requestWithdraw"
  | "withdraw"
  | "reconcile"
  | "withdrawFees";

export function StakeActions({
  stake,
  subaccordAddr,
}: {
  stake: Account<JurorStake>;
  subaccordAddr: Address;
}) {
  const { signer } = useSigner();
  const { data: subaccord } = useSubaccord(subaccordAddr);
  const [action, setAction] = useState<Action>("none");

  if (!subaccord) {
    return <p className="text-sm text-text-secondary">Loading subaccord…</p>;
  }

  return (
    <div className="space-y-4">
      <StakeSummary stake={stake} subaccord={subaccord.data} />
      <ActionPicker stake={stake} action={action} setAction={setAction} />
      {action !== "none" && !signer && (
        <p className="text-sm text-slash">Connect a wallet to sign.</p>
      )}
      {action !== "none" && signer && (
        <ActionForm
          stake={stake}
          subaccord={subaccord}
          subaccordAddr={subaccordAddr}
          signer={signer}
          action={action}
          onClose={() => setAction("none")}
        />
      )}
    </div>
  );
}

function StakeSummary({
  stake,
  subaccord,
}: {
  stake: Account<JurorStake>;
  subaccord: Subaccord;
}) {
  const d = stake.data;
  const effective = d.staked + d.stakeDelta;
  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border border-border-subtle bg-raised p-4 font-mono text-sm">
      <Stat label="Staked" value={formatTokenAmount(d.staked)} />
      <Stat
        label="Settlement delta"
        value={formatTokenAmount(d.stakeDelta)}
        className={
          d.stakeDelta < 0n
            ? "text-slash"
            : d.stakeDelta > 0n
              ? "text-confirm"
              : ""
        }
      />
      <Stat label="Effective" value={formatTokenAmount(effective)} />
      <Stat label="Slash reserve" value={formatTokenAmount(d.slashReserve)} />
      <Stat label="Active draws" value={`${d.activeDraws}`} />
      <Stat label="Fees earned" value={formatTokenAmount(d.feesEarned)} />
      {d.pendingWithdrawal > 0n && (
        <>
          <Stat
            label="Pending withdrawal"
            value={formatTokenAmount(d.pendingWithdrawal)}
            className="text-amber"
          />
          <Stat
            label="Requested at"
            value={
              d.withdrawRequestedAt === 0n ? "—" : ts(d.withdrawRequestedAt)
            }
          />
        </>
      )}
      <Stat label="Tree index" value={`${d.treeIndex}`} />
      <Stat label="Min stake" value={formatTokenAmount(subaccord.minStake)} />
    </div>
  );
}

function ActionPicker({
  stake,
  action,
  setAction,
}: {
  stake: Account<JurorStake>;
  action: Action;
  setAction: (a: Action) => void;
}) {
  const d = stake.data;
  const locked = d.activeDraws > 0;
  const canWithdraw = d.pendingWithdrawal > 0n && !locked;
  const canReconcile = d.stakeDelta !== 0n;
  const canWithdrawFees = d.feesEarned > 0n;

  const btn = (a: Action, label: string, disabled: boolean) => (
    <button
      type="button"
      onClick={() => setAction(action === a ? "none" : a)}
      disabled={disabled}
      className={`rounded-md border px-3 py-2 text-sm transition-colors ${
        action === a
          ? "border-amber bg-amber/10 text-amber"
          : "border-border-subtle text-text-primary hover:border-amber"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {btn("stake", "Stake more", false)}
      {btn("requestWithdraw", "Request withdraw", false)}
      {btn("withdraw", "Withdraw", !canWithdraw)}
      {btn("reconcile", "Reconcile", !canReconcile)}
      {btn("withdrawFees", "Withdraw fees", !canWithdrawFees)}
      {locked && (
        <span className="self-center font-mono text-xs text-slash">
          ⨯ capital locked ({d.activeDraws} active draw
          {d.activeDraws === 1 ? "" : "s"})
        </span>
      )}
    </div>
  );
}

function ActionForm({
  stake,
  subaccord,
  subaccordAddr,
  signer,
  action,
  onClose,
}: {
  stake: Account<JurorStake>;
  subaccord: Account<Subaccord>;
  subaccordAddr: Address;
  signer: TransactionSigner;
  action: Exclude<Action, "none">;
  onClose: () => void;
}) {
  const crpc = useClusterRpc();
  const proof = useStakingProof(subaccordAddr, signer.address);

  // Withdraw + withdrawFees need no proof; the others do.
  const needsProof =
    action === "stake" ||
    action === "requestWithdraw" ||
    action === "reconcile";

  if (!crpc) return <p className="text-sm text-slash">No RPC cluster.</p>;
  if (needsProof && proof.isLoading) {
    return <p className="text-sm text-text-secondary">Building proof…</p>;
  }
  if (needsProof && proof.isError) {
    return (
      <p className="text-sm text-slash">
        Proof failed: {proof.error.message}. Refresh and retry.
      </p>
    );
  }

  const shared = { stake, subaccord, subaccordAddr, signer, crpc, onClose };
  switch (action) {
    case "stake":
      return proof.data ? (
        <StakeForm {...shared} path={proof.data.path} />
      ) : null;
    case "requestWithdraw":
      return proof.data ? (
        <RequestWithdrawForm {...shared} path={proof.data.path} />
      ) : null;
    case "withdraw":
      return <WithdrawForm {...shared} />;
    case "reconcile":
      return proof.data ? (
        <ReconcileForm {...shared} path={proof.data.path} />
      ) : null;
    case "withdrawFees":
      return <WithdrawFeesForm {...shared} />;
  }
}

// --- individual action forms -------------------------------------------------

interface FormProps {
  stake: Account<JurorStake>;
  subaccord: Account<Subaccord>;
  subaccordAddr: Address;
  signer: TransactionSigner;
  crpc: NonNullable<ReturnType<typeof useClusterRpc>>;
  onClose: () => void;
}

function StakeForm({
  subaccord,
  subaccordAddr,
  signer,
  crpc,
  path,
  onClose,
}: FormProps & { path: MSTNode[] }) {
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const accounts = await resolveAccounts(
        subaccord,
        subaccordAddr,
        signer.address,
      );
      const accord = new Accord({ endpoint: crpc.endpoint, signer });
      const ix = accord.methods.stake(accounts, BigInt(amount), path);
      await sendInstruction(crpc.rpc, crpc.rpcSubscriptions, signer, ix);
      toast.success(`Staked ${amount}.`);
      onClose();
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-border-subtle bg-raised p-4"
    >
      <h3 className="font-mono text-sm text-text-secondary">Add collateral.</h3>
      <AmountInput
        label="Amount (atomic units)"
        value={amount}
        onChange={setAmount}
        help={
          <>
            Staking token: <Copyable value={subaccord.data.stakingToken} />
          </>
        }
      />
      <SubmitRow sending={sending} onClose={onClose} label="Stake" />
    </form>
  );
}

function RequestWithdrawForm({
  subaccord,
  subaccordAddr,
  signer,
  crpc,
  path,
  onClose,
}: FormProps & { path: MSTNode[] }) {
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const accounts = await resolveAccounts(
        subaccord,
        subaccordAddr,
        signer.address,
      );
      const accord = new Accord({ endpoint: crpc.endpoint, signer });
      const ix = accord.methods.requestWithdraw(accounts, BigInt(amount), path);
      await sendInstruction(crpc.rpc, crpc.rpcSubscriptions, signer, ix);
      toast.success(`Withdrawal requested: ${amount}. Timelock applies.`);
      onClose();
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-border-subtle bg-raised p-4"
    >
      <h3 className="font-mono text-sm text-text-secondary">
        Request withdraw (phase 1).
      </h3>
      <p className="text-xs text-text-secondary">
        Ledger-only. Funds move at <code>withdraw</code> after the timelock +
        active draws clear.
      </p>
      <AmountInput
        label="Amount (atomic units)"
        value={amount}
        onChange={setAmount}
      />
      <SubmitRow sending={sending} onClose={onClose} label="Request" />
    </form>
  );
}

function WithdrawForm({
  subaccord,
  subaccordAddr,
  signer,
  crpc,
  onClose,
}: FormProps) {
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const accounts = await resolveAccounts(
        subaccord,
        subaccordAddr,
        signer.address,
      );
      const accord = new Accord({ endpoint: crpc.endpoint, signer });
      const ix = accord.methods.withdraw(accounts);
      await sendInstruction(crpc.rpc, crpc.rpcSubscriptions, signer, ix);
      toast.success("Withdrawal claimed.");
      onClose();
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-border-subtle bg-raised p-4"
    >
      <h3 className="font-mono text-sm text-text-secondary">
        Withdraw (phase 2).
      </h3>
      <p className="text-xs text-text-secondary">
        Moves the pending withdrawal from the vault to your ATA. Requires the
        timelock to have elapsed and no active draws.
      </p>
      <SubmitRow sending={sending} onClose={onClose} label="Withdraw" />
    </form>
  );
}

function ReconcileForm({
  subaccord,
  subaccordAddr,
  signer,
  crpc,
  path,
  onClose,
}: FormProps & { path: MSTNode[] }) {
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const accounts = await resolveAccounts(
        subaccord,
        subaccordAddr,
        signer.address,
      );
      const accord = new Accord({ endpoint: crpc.endpoint, signer });
      const ix = accord.methods.reconcileStake(accounts, path);
      await sendInstruction(crpc.rpc, crpc.rpcSubscriptions, signer, ix);
      toast.success("Stake reconciled.");
      onClose();
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-border-subtle bg-raised p-4"
    >
      <h3 className="font-mono text-sm text-text-secondary">Reconcile.</h3>
      <p className="text-xs text-text-secondary">
        Folds the pending settlement delta (slash/reward) into your canonical
        stake and updates the accumulator root.
      </p>
      <SubmitRow sending={sending} onClose={onClose} label="Reconcile" />
    </form>
  );
}

function WithdrawFeesForm({
  subaccord,
  subaccordAddr,
  signer,
  crpc,
  onClose,
}: FormProps) {
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const feeToken = subaccord.data.feeToken;
      const [jurorStake] = await findJurorStakePda({
        subaccord: subaccordAddr,
        juror: signer.address,
      });
      const [jurorFeeTokenAccount, feeVault] = await Promise.all([
        getAtaAddress(signer.address, feeToken),
        getAtaAddress(subaccordAddr, feeToken),
      ]);
      const accord = new Accord({ endpoint: crpc.endpoint, signer });
      const ix = accord.methods.withdrawFees({
        juror: signer.address,
        subaccord: subaccordAddr,
        jurorStake,
        feeToken,
        jurorFeeTokenAccount,
        feeVault,
      });
      await sendInstruction(crpc.rpc, crpc.rpcSubscriptions, signer, ix);
      toast.success("Fees withdrawn.");
      onClose();
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-border-subtle bg-raised p-4"
    >
      <h3 className="font-mono text-sm text-text-secondary">Withdraw fees.</h3>
      <p className="text-xs text-text-secondary">
        Pulls aggregate earned fees from the fee vault. No timelock, no
        active-draws gate — earned fees are not at-risk capital.
      </p>
      <SubmitRow sending={sending} onClose={onClose} label="Withdraw fees" />
    </form>
  );
}

// --- shared helpers ----------------------------------------------------------

/** Resolve the StakingAccounts shared by stake / requestWithdraw / withdraw / reconcile. */
async function resolveAccounts(
  subaccord: Account<Subaccord>,
  subaccordAddr: Address,
  juror: Address,
) {
  const stakingToken = subaccord.data.stakingToken;
  const [jurorStake] = await findJurorStakePda({
    subaccord: subaccordAddr,
    juror,
  });
  const [jurorTokenAccount, stakeVault] = await Promise.all([
    getAtaAddress(juror, stakingToken),
    getAtaAddress(subaccordAddr, stakingToken),
  ]);
  const [accordState] = await findAccordStatePda();
  return {
    juror,
    subaccord: subaccordAddr,
    jurorStake,
    stakingToken,
    jurorTokenAccount,
    stakeVault,
    accordState,
  };
}

// --- primitives --------------------------------------------------------------

function Stat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className={className}>{value}</dd>
    </div>
  );
}

function AmountInput({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: React.ReactNode;
}) {
  return (
    <Field>
      <FieldLabel className="text-xs">{label}</FieldLabel>
      <FieldControl>
        <Input
          inputMode="numeric"
          pattern="[0-9]+"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="0"
          required
          className="font-mono"
        />
      </FieldControl>
      {help && <FieldDescription>{help}</FieldDescription>}
    </Field>
  );
}

function SubmitRow({
  sending,
  onClose,
  label,
}: {
  sending: boolean;
  onClose: () => void;
  label: string;
}) {
  return (
    <div className="flex gap-2">
      <Button type="submit" loading={sending}>
        {sending ? "Signing…" : label}
      </Button>
      <Button type="button" variant="outline" onClick={onClose}>
        Cancel
      </Button>
    </div>
  );
}

function ts(unixSec: bigint): string {
  return new Date(Number(unixSec) * 1000).toLocaleString();
}
