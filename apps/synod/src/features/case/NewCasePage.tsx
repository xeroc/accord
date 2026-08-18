/**
 * New-case form (accord-3rk5, milestone accord-daq8 happy path 1).
 *
 * Controlled form at `/cases/new`:
 *  - Subaccord picker: Plurality-filtered browser (cards show the frozen-fee
 *    preview `minJurySize · feePerJuror` + fee token) over `findAllSubaccords`,
 *    plus a paste-address field with debounced inline fetch validation
 *    (not-found / Median rejected — mirrors the on-chain open_case gate).
 *  - Parties: 2–7 distinct pubkeys; the connected wallet is the opener and is
 *    auto-slotted at index 0 (SPEC: `parties[0]` MUST be the opener).
 *  - Economics: per-party stake `S` (fee_token base units) + join window; the
 *    preview shows pot `N·S` vs frozen fee and gates submit on `N·S > fee`.
 *
 * Calls `openCase` from @useaccord/synod, signs + sends via `sendInstruction`.
 * On success: toast with the case address (case detail lands with accord-o6nn;
 * home will list it).
 */
import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { isAddress, type Address, type Rpc, type SolanaRpcApi } from "@solana/kit";
import {
  findAllSubaccords,
  fetchSubaccordMaybe,
  type Subaccord,
} from "@useaccord/sdk";
import { fetchMaybeSynodCase, findCasePda, openCase } from "@useaccord/synod";

import { useClusterRpc } from "@/shared/rpc";
import { sendInstruction } from "@/shared/transaction";
import { describeError } from "@/shared/errors";
import { useSigner } from "@/shared/wallet";
import { shortenAddress, formatAmount } from "@/shared/format";
import {
  MAX_PARTIES,
  validateRoster,
  feePreview,
  pluralityGate,
  deadlineFromHours,
} from "./newCaseForm";

/** The picked court — either a browser card or an inline-validated paste. */
interface Selection {
  address: Address;
  sub: Subaccord;
}

type PasteStatus =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "checking" }
  | { kind: "notfound" }
  | { kind: "median" }
  | { kind: "ok" };

const DEFAULT_STAKE = "1000";
const DEFAULT_JOIN_HOURS = "72";

export function NewCasePage() {
  const { signer } = useSigner();
  const crpc = useClusterRpc();

  const [selected, setSelected] = useState<Selection | null>(null);
  const [paste, setPaste] = useState("");
  const [pasteStatus, setPasteStatus] = useState<PasteStatus>({ kind: "idle" });
  const [named, setNamed] = useState<string[]>([""]);
  const [stake, setStake] = useState(DEFAULT_STAKE);
  const [joinHours, setJoinHours] = useState(DEFAULT_JOIN_HOURS);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // --- Subaccord browser: all Subaccords on the cluster, Plurality only ---
  const poolQuery = useQuery({
    queryKey: ["synod", "subaccords", crpc?.endpoint],
    enabled: crpc !== null,
    queryFn: async () => {
      const all = await findAllSubaccords(crpc!.rpc);
      // ponytail: unbounded getProgramAccounts — paginate if pools explode
      return all.filter((a) => pluralityGate(a.data.aggregation) === null);
    },
  });

  // --- Paste field: debounced inline fetch validation ---
  useEffect(() => {
    const addr = paste.trim();
    if (!addr) {
      setPasteStatus({ kind: "idle" });
      return;
    }
    if (!isAddress(addr)) {
      setPasteStatus({ kind: "invalid" });
      return;
    }
    if (!crpc) return;
    setPasteStatus({ kind: "checking" });
    const t = setTimeout(async () => {
      try {
        const maybe = await fetchSubaccordMaybe(crpc.rpc, addr as Address);
        if (!maybe.exists) {
          setPasteStatus({ kind: "notfound" });
          return;
        }
        const gate = pluralityGate(maybe.data.aggregation);
        if (gate) {
          setPasteStatus({ kind: "median" });
          return;
        }
        setSelected({ address: addr as Address, sub: maybe.data });
        setPasteStatus({ kind: "ok" });
      } catch {
        setPasteStatus({ kind: "notfound" });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [paste, crpc]);

  // --- Derived validation (pure helpers from ./newCaseForm) ---
  const opener = signer?.address;
  const trimmed = named.map((p) => p.trim());
  const rosterErrors = opener ? validateRoster(opener, trimmed) : [];
  const stakeBig = /^\d+$/.test(stake.trim()) ? BigInt(stake.trim()) : null;
  const hours = Number(joinHours);
  const preview =
    selected && stakeBig !== null
      ? feePreview(selected.sub, stakeBig, named.length)
      : null;
  const deadline = deadlineFromHours(Date.now(), hours);

  const ready =
    !!signer &&
    !!crpc &&
    !!selected &&
    !!opener &&
    rosterErrors.length === 0 &&
    stakeBig !== null &&
    stakeBig > 0n &&
    deadline !== null &&
    (preview?.coversFee ?? false);

  function setParty(i: number, value: string) {
    setNamed((prev) => prev.map((p, j) => (j === i ? value : p)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!signer || !crpc || !selected || !opener || !deadline) return;
    if (stakeBig === null || stakeBig <= 0n) {
      setError("Stake: whole number of base units, greater than zero.");
      return;
    }
    setSending(true);
    try {
      const parties = [opener, ...trimmed.map((a) => a as Address)];
      const { instruction, case: casePda } = await openCase(
        { opener: signer, subaccord: selected.address },
        {
          parties,
          stake: stakeBig,
          joinDeadline: deadline,
          nonce: await nextCaseNonce(crpc.rpc, opener),
        },
      );
      await sendInstruction(crpc.rpc, crpc.rpcSubscriptions, signer, instruction);
      toast.success(`Case opened: ${casePda}`);
      // Case detail + home inbox land with accord-hvf9/accord-o6nn; reset.
      setNamed([""]);
      setSelected(null);
      setPaste("");
      setPasteStatus({ kind: "idle" });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10">
      <header className="mb-8">
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.01em]">
          Convene a case.
        </h1>
        <p className="mb-4 text-muted-foreground">
          Name the parties, set the stake — the jury takes it from there.
        </p>
      </header>

      {!signer ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="mb-2 text-lg font-semibold">Connect a wallet.</p>
          <p className="mb-5 text-muted-foreground">
            You open the case — and you are party 1 of the roster.
          </p>
        </div>
      ) : (
        <form className="flex flex-col gap-7" onSubmit={onSubmit}>
          <fieldset className="grid gap-4 rounded-lg border border-border p-5">
            <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
              Court.
            </legend>

            {poolQuery.isLoading && (
              <p className="text-sm text-muted-foreground">
                Loading Subaccords…
              </p>
            )}
            {poolQuery.isError && (
              <p className="text-sm text-destructive" role="alert">
                Could not load Subaccords: {describeError(poolQuery.error)}
              </p>
            )}
            {poolQuery.data && (
              <div className="grid gap-3 sm:grid-cols-2">
                {poolQuery.data.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No Plurality Subaccords on this cluster — paste an address
                    below.
                  </p>
                )}
                {poolQuery.data.map(({ address, data: sub }) => {
                  const isSelected = selected?.address === address;
                  return (
                    <button
                      type="button"
                      key={address}
                      onClick={() =>
                        setSelected({ address, sub })
                      }
                      className={`rounded-lg border p-4 text-left transition-colors ${
                        isSelected
                          ? "border-amber bg-raised"
                          : "border-border bg-background hover:bg-raised"
                      }`}
                    >
                      <p className="mb-1 font-mono text-sm text-foreground">
                        {shortenAddress(address, 6)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sub.minJurySize} jurors · fee{" "}
                        {formatAmount(sub.feePerJuror)} ·{" "}
                        {shortenAddress(sub.feeToken)}
                      </p>
                      {isSelected && (
                        <p className="mt-2 text-xs text-amber">
                          Frozen fee at open:{" "}
                          {formatAmount(
                            BigInt(sub.minJurySize) * sub.feePerJuror,
                          )}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-sm text-foreground">
                …or paste a Subaccord address.
              </span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-ring focus:outline-none"
                type="text"
                value={paste}
                placeholder="Subaccord address"
                onChange={(e) => setPaste(e.target.value.trim())}
              />
              {pasteStatus.kind === "checking" && (
                <span className="text-xs text-muted-foreground">
                  Checking…
                </span>
              )}
              {pasteStatus.kind === "invalid" && (
                <span className="text-xs text-destructive">
                  Not a valid address.
                </span>
              )}
              {pasteStatus.kind === "notfound" && (
                <span className="text-xs text-destructive">
                  No Subaccord at that address on this cluster.
                </span>
              )}
              {pasteStatus.kind === "median" && (
                <span className="text-xs text-destructive">
                  Median court — Synod cases need a Plurality Subaccord.
                </span>
              )}
              {pasteStatus.kind === "ok" && selected && (
                <span className="text-xs text-amber">
                  Selected {shortenAddress(selected.address, 6)} — fee{" "}
                  {formatAmount(
                    BigInt(selected.sub.minJurySize) *
                      selected.sub.feePerJuror,
                  )}{" "}
                  frozen at open.
                </span>
              )}
            </label>
          </fieldset>

          <fieldset className="grid gap-4 rounded-lg border border-border p-5">
            <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
              Parties.
            </legend>
            <p className="rounded-md border border-border bg-raised px-3 py-2 font-mono text-sm text-foreground">
              Party 1 (you, opener): {shortenAddress(opener ?? "—", 6)}
            </p>
            {named.map((p, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1">
                  <Field
                    label={`Party ${i + 2}`}
                    placeholder="Party address"
                    value={p}
                    onChange={(v) => setParty(i, v)}
                    mono
                  />
                </div>
                <button
                  type="button"
                  className="mt-6 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() =>
                    setNamed((prev) => prev.filter((_, j) => j !== i))
                  }
                  aria-label={`Remove party ${i + 2}`}
                >
                  Remove
                </button>
              </div>
            ))}
            {named.length < MAX_PARTIES - 1 && (
              <button
                type="button"
                className="self-start rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setNamed((prev) => [...prev, ""])}
              >
                + Name another party.
              </button>
            )}
            {rosterErrors.map((err) => (
              <p key={err} className="text-xs text-destructive" role="alert">
                {err}
              </p>
            ))}
          </fieldset>

          <fieldset className="grid gap-4 rounded-lg border border-border p-5">
            <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
              Escrow.
            </legend>
            <Field
              label="Stake S per party"
              help={`Base units of the Subaccord fee token. Every party locks S; pot is N·S.`}
              value={stake}
              onChange={setStake}
              required
              mono
            />
            <Field
              label="Join window (hours)"
              help="After this, an incomplete roster refunds every joined party."
              value={joinHours}
              onChange={setJoinHours}
              required
              mono
            />
          </fieldset>

          {preview && (
            <div className="grid gap-2 rounded-lg border border-border p-5 font-mono text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Preview.
              </p>
              <p>
                Parties: {preview.partyCount} · Pot:{" "}
                {formatAmount(preview.pot)} · Frozen fee:{" "}
                {formatAmount(preview.frozenFee)} · Winner nets:{" "}
                <span className={preview.coversFee ? "text-confirm" : "text-destructive"}>
                  {formatAmount(preview.netToWinner)}
                </span>
              </p>
              {deadline !== null && (
                <p className="text-xs text-muted-foreground">
                  Join deadline: {new Date(Number(deadline) * 1000).toLocaleString()}
                </p>
              )}
              {!preview.coversFee && (
                <p className="text-xs text-destructive" role="alert">
                  Pot must exceed the frozen fee (N·S &gt; fee) — raise the stake.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="font-mono text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50"
            disabled={!ready || sending}
          >
            {sending ? "Signing…" : "Open case."}
          </button>
        </form>
      )}
    </main>
  );
}

// --- field primitive (canon-shaped) -----------------------------------------

function Field({
  label,
  help,
  placeholder,
  value,
  onChange,
  required,
  mono,
}: {
  label: string;
  help?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-foreground">
        {label}.{required ? " *" : ""}
      </span>
      <input
        className={`rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none ${mono ? "font-mono text-sm text-foreground" : ""}`}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      {help && <span className="text-xs text-muted-foreground">{help}</span>}
    </label>
  );
}

/**
 * First free case-open nonce for `opener`: probe `["case", opener, n]` PDAs
 * from 0 until one doesn't exist on-chain. Sequential nonces keep the seed
 * recoverable by every consumer (`recoverCaseNonce` in caseDetail.ts) —
 * `SynodCase` stores no seed backrefs (SPEC §Instructions #3).
 */
async function nextCaseNonce(
  rpc: Rpc<SolanaRpcApi>,
  opener: Address,
): Promise<bigint> {
  for (let n = 0n; n < 64n; n++) {
    const [pda] = await findCasePda({ opener, nonce: n });
    const maybe = await fetchMaybeSynodCase(rpc, pda);
    if (!maybe.exists) return n;
  }
  throw new Error("This opener already has 64 open cases — close one first.");
}
