/**
 * StakePage — `/juror/stake?subaccord=<addr>` route.
 *
 * Two modes:
 *   - Juror has no stake in this Subaccord yet → render the initial stake form.
 *   - Juror already has a JurorStake → render {@link StakeActions} (stake more,
 *     request withdraw, withdraw, reconcile, withdraw fees).
 *
 * Reads `?subaccord=` (the deep link from SubaccordDetailPage). Falls back to
 * a subaccord selector when the param is missing.
 */
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { type Address } from "@solana/kit";
import { Loader2Icon } from "lucide-react";
import { Accord, findJurorStakePda, findPauseStatePda } from "@useaccord/sdk";
import { toast } from "sonner";

import { useClusterRpc } from "../../shared/rpc";
import { useSigner } from "../../shared/wallet";
import { sendInstruction } from "../../shared/transaction";
import { unwrapError } from "../../shared/errors";
import { getAtaAddress } from "../../shared/tokens";
import { formatTokenAmount } from "../../shared/format";
import { Copyable } from "../../components/Copyable";
import { useSubaccord } from "../dispute/useSubaccord";
import { useJurorStake } from "./useJurorStakes";
import { useStakingProof } from "./useStakingProof";
import { StakeActions } from "./StakeActions";

export function StakePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { signer } = useSigner();
  const [subaccordInput, setSubaccordInput] = useState(
    searchParams.get("subaccord") ?? "",
  );

  const subaccordAddr = (searchParams.get("subaccord") ?? "") as Address;
  const { data: subaccord } = useSubaccord(subaccordAddr || undefined);
  const { data: jurorStake, isLoading: stakeLoading } = useJurorStake(
    subaccordAddr || undefined,
    signer?.address,
  );

  function pickSubaccord(addr: string) {
    setSubaccordInput(addr);
    if (addr) setSearchParams({ subaccord: addr });
    else setSearchParams({});
  }

  return (
    <main className="page">
      <header className="page-head">
        <Link to="/juror" className="back">
          ← Juror dashboard.
        </Link>
        <h1 className="title">Stake & manage.</h1>
        <p className="lede">
          Deposit collateral. Become eligible for the draw. Earn fees.
        </p>
      </header>

      {!signer ? (
        <div className="empty">
          <p className="empty-head">Connect a wallet.</p>
          <p className="empty-body">
            Staking signs with your wallet as the juror.
          </p>
        </div>
      ) : (
        <>
          {/* Subaccord selector */}
          <section className="mb-6">
            <label className="mb-1 block font-mono text-xs text-text-secondary">
              Subaccord
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={subaccordInput}
                onChange={(e) => pickSubaccord(e.target.value.trim())}
                placeholder="Subaccord address"
                className="input mono flex-1"
              />
              {subaccord && (
                <Link
                  to={`/subaccords/${subaccord.address}`}
                  className="cta cta-ghost"
                >
                  View pool.
                </Link>
              )}
            </div>
            {subaccordAddr && !subaccord && (
              <p className="mt-1 text-sm text-slash">Subaccord not found.</p>
            )}
          </section>

          {subaccord && (
            <SubaccordStakingTerms subaccordAddr={subaccord.address} />
          )}

          {subaccord && stakeLoading && (
            <p className="text-sm text-text-secondary">Loading your stake…</p>
          )}

          {subaccord && !stakeLoading && jurorStake && (
            <StakeActions
              stake={jurorStake}
              subaccordAddr={subaccord.address}
            />
          )}

          {subaccord && !stakeLoading && !jurorStake && signer && (
            <InitialStakeForm
              subaccordAddr={subaccord.address}
              juror={signer.address}
            />
          )}
        </>
      )}
    </main>
  );
}

function SubaccordStakingTerms({ subaccordAddr }: { subaccordAddr: Address }) {
  const { data: subaccord } = useSubaccord(subaccordAddr);
  if (!subaccord) return null;
  const d = subaccord.data;
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-border-subtle bg-raised p-4 font-mono text-sm sm:grid-cols-4">
      <div>
        <dt className="text-xs text-text-secondary">Staking token</dt>
        <dd>
          <Copyable value={d.stakingToken} />
        </dd>
      </div>
      <div>
        <dt className="text-xs text-text-secondary">Min stake</dt>
        <dd>{formatTokenAmount(d.minStake)}</dd>
      </div>
      <div>
        <dt className="text-xs text-text-secondary">Alpha</dt>
        <dd>{(d.alphaBps / 100).toFixed(2)}%</dd>
      </div>
      <div>
        <dt className="text-xs text-text-secondary">Fee per juror</dt>
        <dd>{formatTokenAmount(d.feePerJuror)}</dd>
      </div>
    </div>
  );
}

function InitialStakeForm({
  subaccordAddr,
  juror,
}: {
  subaccordAddr: Address;
  juror: Address;
}) {
  const crpc = useClusterRpc();
  const { signer } = useSigner();
  const { data: subaccord } = useSubaccord(subaccordAddr);
  const [amount, setAmount] = useState("");
  // Only build the MST proof once the user starts typing an amount — avoids
  // burning CPU on the accumulator rebuild before there's intent to stake.
  // Kicks in on the first digit, ahead of reaching the minimum.
  const proof = useStakingProof(subaccordAddr, amount ? juror : undefined);
  const [sending, setSending] = useState(false);

  if (!subaccord || !signer || !crpc) return null;
  const minStake = subaccord.data.minStake;
  const meetsMin = amount && BigInt(amount) >= minStake;
  const proofLoading = proof.isLoading;
  const ready = !!amount && meetsMin && proof.data && !sending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subaccord || !signer || !crpc || !proof.data) return;
    setSending(true);
    try {
      const stakingToken = subaccord.data.stakingToken;
      const [jurorStake] = await findJurorStakePda({
        subaccord: subaccordAddr,
        juror,
      });
      const [jurorTokenAccount, stakeVault] = await Promise.all([
        getAtaAddress(juror, stakingToken),
        getAtaAddress(subaccordAddr, stakingToken),
      ]);
      const [pauseState] = await findPauseStatePda();
      const accord = new Accord({ endpoint: crpc.endpoint, signer });
      const ix = accord.methods.stake(
        {
          juror,
          subaccord: subaccordAddr,
          pauseState,
          jurorStake,
          stakingToken,
          jurorTokenAccount,
          stakeVault,
        },
        BigInt(amount),
        proof.data.path,
      );
      await sendInstruction(crpc.rpc, crpc.rpcSubscriptions, signer, ix);
      toast.success(`Staked ${amount}. You are now draw-eligible.`);
      setAmount("");
    } catch (err) {
      toast.error(unwrapError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border border-border-subtle bg-raised p-4"
    >
      <h2 className="font-mono text-sm text-text-secondary">
        Open a juror position.
      </h2>
      {proof.isLoading && (
        <p className="text-sm text-text-secondary">
          Building accumulator proof…
        </p>
      )}
      {proof.isError && (
        <p className="text-sm text-slash">
          Proof failed: {proof.error.message}
        </p>
      )}
      <label className="block">
        <span className="mb-1 block font-mono text-xs text-text-secondary">
          Amount (atomic units)
        </span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]+"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder={minStake.toString()}
          required
          className="w-full rounded-md border border-border-subtle bg-ink px-3 py-2 font-mono text-sm text-text-primary focus:border-amber focus:outline-none"
        />
        <span className="mt-1 block text-xs text-text-secondary">
          Minimum stake: {formatTokenAmount(minStake)} (staking token{" "}
          <Copyable value={subaccord.data.stakingToken} />)
        </span>
        {amount && !meetsMin && (
          <span className="mt-1 block text-xs text-slash">
            Below the minimum.
          </span>
        )}
      </label>
      <button
        type="submit"
        disabled={!ready}
        className="inline-flex items-center gap-2 rounded-md bg-amber px-4 py-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {proofLoading ? <Loader2Icon className="size-4 animate-spin" /> : null}
        {sending ? "Signing…" : "Stake."}
      </button>
    </form>
  );
}
