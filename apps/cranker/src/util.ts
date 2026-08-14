/**
 * Crank-shared helpers — token ATA derivation, decoded account fetches, and
 * PDA resolution. Kit-only (no `@solana/spl-token` — it pulls web3.js v1 and
 * breaks the toolchain, same reason as the e2e setup).
 *
 * The SDK's root-barrel PDA helpers return the Kit tuple
 * `[Address, bump]`; these wrappers return just `Address` since no crank
 * needs the bump.
 */
import {
  getAddressEncoder,
  getProgramDerivedAddress,
  type Account,
  type Address,
  type GetAccountInfoApi,
  type Rpc,
} from "@solana/kit";
import {
  fetchMaybeAppealBond,
  fetchMaybeDispute,
  fetchMaybeAccordState,
  fetchMaybePendingUpdate,
  fetchMaybeRound,
  fetchMaybeSubaccord,
  findAppealBondPda,
  findJurorStakePda,
  findAccordStatePda,
  findPendingUpdatePda,
  findRoundPda,
  type AppealBond,
  type Dispute,
  type AccordState,
  type PendingUpdate,
  type Round,
  type Subaccord,
} from "@useaccord/sdk";
import {
  fetchMaybeCanonItem as fetchMaybeCanonItemGenerated,
  fetchMaybeCanonList as fetchMaybeCanonListGenerated,
  type CanonItem,
  type CanonList,
} from "@useaccord/canon";

/** SPL Token program. */
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;

/** SPL Associated Token Account program. */
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

const SYSTEM_PROGRAM = "11111111111111111111111111111111" as Address;

/** Derive the associated token account for `(owner, mint)` — Kit-only. */
export async function ataOf(mint: Address, owner: Address): Promise<Address> {
  const enc = getAddressEncoder();
  const [ata] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ID,
    seeds: [enc.encode(owner), enc.encode(TOKEN_PROGRAM_ID), enc.encode(mint)],
  });
  return ata;
}

/** Fetch + decode a Dispute, throw if missing. */
export async function fetchDispute(
  rpc: Rpc<GetAccountInfoApi>,
  dispute: Address,
): Promise<Account<Dispute>> {
  const acc = await fetchMaybeDispute(rpc, dispute);
  if (!acc.exists) throw new Error(`Dispute not found: ${dispute}`);
  return acc as Account<Dispute>;
}

/** Fetch + decode a Subaccord, throw if missing. */
export async function fetchSubaccord(
  rpc: Rpc<GetAccountInfoApi>,
  subaccord: Address,
): Promise<Account<Subaccord>> {
  const acc = await fetchMaybeSubaccord(rpc, subaccord);
  if (!acc.exists) throw new Error(`Subaccord not found: ${subaccord}`);
  return acc as Account<Subaccord>;
}

/** Fetch + decode a Round, throw if missing. */
export async function fetchRound(
  rpc: Rpc<GetAccountInfoApi>,
  round: Address,
): Promise<Account<Round>> {
  const acc = await fetchMaybeRound(rpc, round);
  if (!acc.exists) throw new Error(`Round not found: ${round}`);
  return acc as Account<Round>;
}

/** Fetch + decode an AppealBond, throw if missing. */
export async function fetchAppealBond(
  rpc: Rpc<GetAccountInfoApi>,
  appealBond: Address,
): Promise<Account<AppealBond>> {
  const acc = await fetchMaybeAppealBond(rpc, appealBond);
  if (!acc.exists) throw new Error(`AppealBond not found: ${appealBond}`);
  return acc as Account<AppealBond>;
}

/** Fetch + decode the singleton AccordState, throw if missing. */
export async function fetchAccordState(
  rpc: Rpc<GetAccountInfoApi>,
  accordState: Address,
): Promise<Account<AccordState>> {
  const acc = await fetchMaybeAccordState(rpc, accordState);
  if (!acc.exists) throw new Error(`AccordState not found: ${accordState}`);
  return acc as Account<AccordState>;
}

/** Resolve a Round PDA address by index. */
export async function roundPda(
  programId: Address,
  dispute: Address,
  roundIdx: number,
): Promise<Address> {
  const [address] = await findRoundPda({ dispute, roundIdx }, { programAddress: programId });
  return address;
}

/** Resolve an AppealBond PDA address for a round. */
export async function appealBondPda(
  programId: Address,
  dispute: Address,
  roundIdx: number,
): Promise<Address> {
  const [address] = await findAppealBondPda({ dispute, roundIdx }, { programAddress: programId });
  return address;
}

/** Resolve the singleton AccordState PDA address. */
export async function accordStatePda(programId: Address): Promise<Address> {
  const [address] = await findAccordStatePda({ programAddress: programId });
  return address;
}

/**
 * The drawn JurorStake PDAs for a round — `remainingAccounts` for
 * finalize_round / settle_round / finalize_dispute / redraw. Filters the
 * fixed-size `jurors` array to non-system-program addresses (filled seats).
 */
export async function panelStakePdas(
  programId: Address,
  subaccord: Address,
  jurors: Address[],
): Promise<Address[]> {
  const out: Address[] = [];
  for (const j of jurors) {
    if (j === SYSTEM_PROGRAM) continue;
    const [address] = await findJurorStakePda(
      { subaccord, juror: j },
      { programAddress: programId },
    );
    out.push(address);
  }
  return out;
}

/**
 * The live PendingUpdate for a Subaccord (0 or 1). The PDA is
 * `["update", subaccord, nonce_le8]` with a caller-chosen nonce; we scan a
 * small window (governance nonce advances per propose, usually 0–2) via the
 * SDK's typed fetcher. No raw getProgramAccounts / discriminator plumbing.
 */
export async function findPendingUpdateForSubaccord(
  rpc: Rpc<GetAccountInfoApi>,
  programId: Address,
  subaccord: Address,
): Promise<Account<PendingUpdate> | null> {
  for (let nonce = 0n; nonce < 16n; nonce++) {
    const [address] = await findPendingUpdatePda(
      { subaccord, nonce },
      { programAddress: programId },
    );
    const acc = await fetchMaybePendingUpdate(rpc, address);
    if (acc.exists && (acc as Account<PendingUpdate>).data.subaccord === subaccord) {
      return acc as Account<PendingUpdate>;
    }
  }
  return null;
}

// --- Canon (bare-RPC generated fetchers; the Canon client is not needed) ---

/** Fetch + decode a CanonItem, throw if missing. */
export async function fetchCanonItem(
  rpc: Rpc<GetAccountInfoApi>,
  item: Address,
): Promise<Account<CanonItem>> {
  const acc = await fetchMaybeCanonItemGenerated(rpc, item);
  if (!acc.exists) throw new Error(`CanonItem not found: ${item}`);
  return acc as Account<CanonItem>;
}

/** Fetch + decode a CanonList, throw if missing. */
export async function fetchCanonList(
  rpc: Rpc<GetAccountInfoApi>,
  list: Address,
): Promise<Account<CanonList>> {
  const acc = await fetchMaybeCanonListGenerated(rpc, list);
  if (!acc.exists) throw new Error(`CanonList not found: ${list}`);
  return acc as Account<CanonList>;
}
