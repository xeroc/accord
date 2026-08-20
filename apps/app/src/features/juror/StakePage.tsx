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
import { Accord, findJurorStakePda, findAccordStatePda } from "@useaccord/sdk";
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
  EmptyState,
  Field,
  FieldControl,
  FieldError,
  FieldDescription,
  FieldLabel,
  Input,
} from "@useaccord/ui";
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
    <>
      <header className="mb-8">
        <Link to="/juror" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Juror dashboard.
        </Link>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Stake & manage.</h1>
        <p className="mb-4 text-muted-foreground">
          Deposit collateral. Become eligible for the draw. Earn fees.
        </p>
      </header>

      {!signer ? (
        <EmptyState
          title="Connect a wallet."
          description="Staking signs with your wallet as the juror."
        />
      ) : (
        <>
          {/* Subaccord selector */}
          <section className="mb-6">
            <Field invalid={!!subaccordAddr && !subaccord}>
              <FieldLabel className="text-xs">Subaccord</FieldLabel>
              <div className="flex gap-2">
                <div className="flex-1">
                  <FieldControl>
                    <Input
                      value={subaccordInput}
                      onChange={(e) => pickSubaccord(e.target.value.trim())}
                      placeholder="Subaccord address"
                      className="font-mono"
                    />
                  </FieldControl>
                </div>
                {subaccord && (
                  <Button variant="outline" asChild>
                    <Link to={`/subaccords/${subaccord.address}`}>
                      View pool.
                    </Link>
                  </Button>
                )}
              </div>
              <FieldError>
                {subaccordAddr && !subaccord ? "Subaccord not found." : null}
              </FieldError>
            </Field>
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
    </>
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
  // Draw-eligibility floor: draw_seat requires free stake ≥ min_stake + α·min_stake
  // (each draw reserves α·min_stake and needs min_stake free afterwards). Staking
  // exactly min_stake can never be drawn — the on-chain `stake` ix enforces this
  // same floor on the first deposit; this mirrors it client-side. Top-ups
  // (StakeActions) are not gated.
  const minInitial =
    minStake + (BigInt(subaccord.data.alphaBps) * minStake) / 10_000n;
  const meetsMin = amount && BigInt(amount) >= minInitial;
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
      const [accordState] = await findAccordStatePda();
      const accord = new Accord({ endpoint: crpc.endpoint, signer });
      const ix = accord.methods.stake(
        {
          juror,
          subaccord: subaccordAddr,
          accordState,
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
      toast.error(describeError(err));
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
      <Field invalid={!!(amount && !meetsMin)}>
        <FieldLabel className="text-xs">Amount (atomic units)</FieldLabel>
        <FieldControl>
          <Input
            inputMode="numeric"
            pattern="[0-9]+"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={minInitial.toString()}
            required
            className="font-mono"
          />
        </FieldControl>
        <FieldDescription>
          Minimum to be draw-eligible: {formatTokenAmount(minInitial)} (min
          stake + α·min stake; staking token{" "}
          <Copyable value={subaccord.data.stakingToken} />)
        </FieldDescription>
        <FieldError>
          {amount && !meetsMin ? "Below the draw-eligibility minimum." : null}
        </FieldError>
      </Field>
      <Button type="submit" disabled={!ready} loading={proofLoading}>
        {sending ? "Signing…" : "Stake."}
      </Button>
    </form>
  );
}
