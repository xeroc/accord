/**
 * Typed `getProgramAccounts` query wrappers.
 *
 * Each function encapsulates the discriminator + memcmp construction so the
 * caller never touches raw bytes. Returns typed `Account<T>[]` with the
 * account address preserved (needed for deep links, PDA navigation, etc.).
 *
 * @see ADR-0010
 */

import {
  type Account,
  type Address,
  type Base64EncodedBytes,
  type Commitment,
  getAddressEncoder,
  type GetProgramAccountsApi,
  parseBase64RpcAccount,
  type ReadonlyUint8Array,
  type Rpc,
} from "@solana/kit";

import {
  DISPUTE_DISCRIMINATOR,
  decodeDispute,
  type Dispute,
} from "./generated/accounts/dispute.js";
import {
  PENDING_UPDATE_DISCRIMINATOR,
  decodePendingUpdate,
  type PendingUpdate,
} from "./generated/accounts/pendingUpdate.js";
import { ACCORD_PROGRAM_ID } from "./pda.js";

export type QueryConfig = {
  commitment?: Commitment;
  abortSignal?: AbortSignal;
};

function discriminatorToBase64(d: ReadonlyUint8Array): Base64EncodedBytes {
  // ponytail: btoa for 8-byte discriminator — no perf concern
  return btoa(String.fromCharCode(...d)) as Base64EncodedBytes;
}

/**
 * Fetch every Dispute account on-chain, decoded and typed.
 * Filters by the 8-byte account discriminator at offset 0.
 */
export async function findAllDisputes(
  rpc: Rpc<GetProgramAccountsApi>,
  config?: QueryConfig,
): Promise<Account<Dispute>[]> {
  const results = await rpc
    .getProgramAccounts(ACCORD_PROGRAM_ID, {
      encoding: "base64",
      filters: [
        {
          memcmp: {
            offset: 0n,
            bytes: discriminatorToBase64(DISPUTE_DISCRIMINATOR),
            encoding: "base64",
          },
        },
      ],
      commitment: config?.commitment,
    })
    .send();

  return results.map(({ pubkey, account }) =>
    decodeDispute(parseBase64RpcAccount(pubkey as Address, account)),
  );
}

/**
 * Fetch every PendingUpdate account on-chain, decoded and typed.
 * Filters by the 8-byte account discriminator at offset 0.
 */
export async function findAllPendingUpdates(
  rpc: Rpc<GetProgramAccountsApi>,
  config?: QueryConfig,
): Promise<Account<PendingUpdate>[]> {
  const results = await rpc
    .getProgramAccounts(ACCORD_PROGRAM_ID, {
      encoding: "base64",
      filters: [
        {
          memcmp: {
            offset: 0n,
            bytes: discriminatorToBase64(PENDING_UPDATE_DISCRIMINATOR),
            encoding: "base64",
          },
        },
      ],
      commitment: config?.commitment,
    })
    .send();

  return results.map(({ pubkey, account }) =>
    decodePendingUpdate(parseBase64RpcAccount(pubkey as Address, account)),
  );
}

// ---------------------------------------------------------------------------
// SAS attestation discovery (PROG-ATTESTTION)
// ---------------------------------------------------------------------------

/** Solana Attestation Service program — owner of Attestation accounts. */
export const SAS_PROGRAM_ID =
  "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG" as Address;

// Fixed offsets within a SAS Attestation account (mirror of `sas_layout`
// in programs/accord/src/attestation.rs): credential@33, schema@65, and the
// subject wallet at data[0..32]⇒101 when data_len ≥ 32. NO length filter:
// real SAS accounts run longer than the 173-byte minimal layout (devnet
// carries 205-byte accounts — 32 trailing bytes past expiry) and RPC
// `dataSize` is an EXACT match, which silently excluded them.
const SAS_CREDENTIAL_OFFSET = 33;
const SAS_SCHEMA_OFFSET = 65;
const SAS_WALLET_OFFSET = 101;

function addressToBase64(a: Address): Base64EncodedBytes {
  // ponytail: btoa for a 32-byte address — same as the discriminator helper
  return btoa(String.fromCharCode(...getAddressEncoder().encode(a))) as Base64EncodedBytes;
}

/**
 * Find the juror's SAS attestation account for a Subaccord's
 * `(credential, schema)` binding. One `getProgramAccounts` scan with three
 * 32-byte memcmp filters — the binding + subject wallet uniquely identify an
 * attestation (SAS nonce is a free seed, so Accord never derives the address;
 * it reads by content). Returns `null` when none exists — callers treat that
 * as "cannot draw / prune" rather than retry.
 */
export async function findSasAttestation(
  rpc: Rpc<GetProgramAccountsApi>,
  binding: { credential: Address; schema: Address; juror: Address },
  config?: QueryConfig,
): Promise<Address | null> {
  const found = await rpc
    .getProgramAccounts(SAS_PROGRAM_ID, {
      encoding: "base64",
      filters: [
        {
          memcmp: {
            bytes: addressToBase64(binding.credential),
            offset: BigInt(SAS_CREDENTIAL_OFFSET),
            encoding: "base64",
          },
        },
        {
          memcmp: {
            bytes: addressToBase64(binding.schema),
            offset: BigInt(SAS_SCHEMA_OFFSET),
            encoding: "base64",
          },
        },
        {
          memcmp: {
            bytes: addressToBase64(binding.juror),
            offset: BigInt(SAS_WALLET_OFFSET),
            encoding: "base64",
          },
        },
      ],
      commitment: config?.commitment,
    })
    .send();
  return found.length > 0 ? (found[0]!.pubkey as Address) : null;
}
