/**
 * Typed `getProgramAccounts` wrappers — bulk reads that hide discriminator +
 * memcmp-offset construction from the caller. Each function returns fully
 * decoded `Account<T>[]`; no raw bytes, no memcmp offsets, no decoders leak.
 *
 * Filters match the 8-byte Anchor discriminator at offset 0 plus an optional
 * 32-byte `Address` field. Offsets below are fixed by the generated struct
 * layouts (see `./generated/accounts/*.ts`); the round-trip in `query.test.ts`
 * fails if they ever drift.
 *
 * Accepts a raw Kit `Rpc<GetProgramAccountsApi>` — the same `rpc` the facade
 * (`Accord.rpc`) or a bare `createSolanaRpc(...)` exposes.
 *
 * @see ADR-0010
 */

import {
  getAddressEncoder,
  getBase58Decoder,
  getBase64Encoder,
  type Account,
  type Address,
  type Base58EncodedBytes,
  type GetProgramAccountsApi,
  type GetProgramAccountsMemcmpFilter,
  type ReadonlyUint8Array,
  type Rpc,
} from "@solana/kit";

import { ACCORD_PROGRAM_ID } from "./pda.js";
import {
  DISPUTE_DISCRIMINATOR,
  JUROR_STAKE_DISCRIMINATOR,
  SUBACCORD_DISCRIMINATOR,
  getDisputeDecoder,
  getJurorStakeDecoder,
  getSubaccordDecoder,
  type Dispute,
  type JurorStake,
  type Subaccord,
} from "./generated/accounts/index.js";

// --- internal filter builders ----------------------------------------------

const base58 = getBase58Decoder();
const addressEncoder = getAddressEncoder();

/** Anchor account discriminator sits at offset 0 (8 bytes). */
function discriminatorFilter(
  discriminator: ReadonlyUint8Array,
): GetProgramAccountsMemcmpFilter {
  return {
    memcmp: {
      offset: 0n,
      // Kit's base58 decoder yields plain `string`; brand it for the filter.
      bytes: base58.decode(discriminator) as Base58EncodedBytes,
      encoding: "base58",
    },
  };
}

/** A 32-byte `Address` field at a fixed byte offset (base58-encoded). */
function addressFilter(
  offset: bigint,
  address: Address,
): GetProgramAccountsMemcmpFilter {
  return {
    memcmp: {
      offset,
      bytes: base58.decode(
        addressEncoder.encode(address),
      ) as Base58EncodedBytes,
      encoding: "base58",
    },
  };
}

// --- byte offsets (from the generated struct layouts) ----------------------
// Field order per `./generated/accounts/*.ts` encoders:
//   JurorStake: disc(8) | subaccord(32) | juror(32) | ...
//   Dispute:    disc(8) | subaccord(32) | filer(32)  | ...
// Discriminator = 8 bytes; the first Address field follows at 8, the next at 40.
const OFFSET_FIRST_ADDRESS = 8n;
const OFFSET_SECOND_ADDRESS = 40n;

// --- core GPA + decode ------------------------------------------------------

async function fetchDecodedAccounts<T extends object>(
  rpc: Rpc<GetProgramAccountsApi>,
  filters: GetProgramAccountsMemcmpFilter[],
  decode: (bytes: ReadonlyUint8Array | Uint8Array) => T,
  programAddress: Address = ACCORD_PROGRAM_ID,
): Promise<Account<T>[]> {
  const accountInfos = await rpc
    .getProgramAccounts(programAddress, { encoding: "base64", filters })
    .send();
  const base64 = getBase64Encoder();
  return accountInfos.map((info) => {
    const [data] = info.account.data;
    return {
      ...info.account,
      address: info.pubkey,
      programAddress,
      data: decode(base64.encode(data)),
    } as Account<T>;
  });
}

// --- public typed wrappers --------------------------------------------------

/** All Subaccords on the Accord program (discriminator-only filter). */
export function findAllSubaccords(
  rpc: Rpc<GetProgramAccountsApi>,
): Promise<Account<Subaccord>[]> {
  return fetchDecodedAccounts(
    rpc,
    [discriminatorFilter(SUBACCORD_DISCRIMINATOR)],
    (b) => getSubaccordDecoder().decode(b),
  );
}

/** Every JurorStake on the Accord program (global browse / aggregation). */
export function findAllJurorStakes(
  rpc: Rpc<GetProgramAccountsApi>,
): Promise<Account<JurorStake>[]> {
  return fetchDecodedAccounts(
    rpc,
    [discriminatorFilter(JUROR_STAKE_DISCRIMINATOR)],
    (b) => getJurorStakeDecoder().decode(b),
  );
}

/** Every JurorStake for a Subaccord (draw pool / accumulator rebuild). */
export function findJurorStakesBySubaccord(
  rpc: Rpc<GetProgramAccountsApi>,
  subaccord: Address,
): Promise<Account<JurorStake>[]> {
  return fetchDecodedAccounts(
    rpc,
    [
      discriminatorFilter(JUROR_STAKE_DISCRIMINATOR),
      addressFilter(OFFSET_FIRST_ADDRESS, subaccord),
    ],
    (b) => getJurorStakeDecoder().decode(b),
  );
}

/** Every JurorStake owned by a juror across all Subaccords. */
export function findJurorStakesByJuror(
  rpc: Rpc<GetProgramAccountsApi>,
  juror: Address,
): Promise<Account<JurorStake>[]> {
  return fetchDecodedAccounts(
    rpc,
    [
      discriminatorFilter(JUROR_STAKE_DISCRIMINATOR),
      addressFilter(OFFSET_SECOND_ADDRESS, juror),
    ],
    (b) => getJurorStakeDecoder().decode(b),
  );
}

/** Every Dispute filed under a Subaccord. */
export function findDisputesBySubaccord(
  rpc: Rpc<GetProgramAccountsApi>,
  subaccord: Address,
): Promise<Account<Dispute>[]> {
  return fetchDecodedAccounts(
    rpc,
    [
      discriminatorFilter(DISPUTE_DISCRIMINATOR),
      addressFilter(OFFSET_FIRST_ADDRESS, subaccord),
    ],
    (b) => getDisputeDecoder().decode(b),
  );
}

/** Every Dispute filed by a given filer. */
export function findDisputesByFiler(
  rpc: Rpc<GetProgramAccountsApi>,
  filer: Address,
): Promise<Account<Dispute>[]> {
  return fetchDecodedAccounts(
    rpc,
    [
      discriminatorFilter(DISPUTE_DISCRIMINATOR),
      addressFilter(OFFSET_SECOND_ADDRESS, filer),
    ],
    (b) => getDisputeDecoder().decode(b),
  );
}
