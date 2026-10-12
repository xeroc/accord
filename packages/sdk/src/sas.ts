/**
 * sas.ts — SAS (Solana Attestation Service) attestation reads.
 *
 * The foreign-program half of the attestation gate (ADR-0024,
 * PROG-ATTESTTION): Subaccords may bind a `(juror_credential, juror_schema)`
 * pair and require every juror to hold a matching SAS `Attestation` account.
 * The on-chain gate (`programs/accord/src/attestation.rs` `sas_layout`) parses
 * those accounts by hand — the decoder here mirrors its offsets byte-for-byte
 * so UIs can display what the program enforces.
 *
 * `findSasAttestations` scans the SAS program via `getProgramAccounts` and can
 * pre-filter server-side: discriminator, credential, schema, and subject
 * wallet all sit at fixed offsets (the variable-length `data` blob starts
 * after them), so each is a memcmp filter. Accounts that fail to decode are
 * skipped rather than thrown — the SAS program is foreign and may carry
 * account shapes this decoder doesn't model.
 */

import {
  getBase58Decoder,
  getBase64Encoder,
  getAddressDecoder,
  type Account,
  type Address,
  type Base58EncodedBytes,
  type GetProgramAccountsApi,
  type GetProgramAccountsMemcmpFilter,
  type ReadonlyUint8Array,
  type Rpc,
} from "@solana/kit";

import { addressFilter } from "./query.js";

/** SAS program (solana-attestation-service) — owner of attestation accounts. */
export const SAS_PROGRAM_ID =
  "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG" as Address;

/** `AttestationDiscriminator` (SAS `program/src/state/attestation.rs`). */
export const SAS_ATTESTATION_DISCRIMINATOR = 2;

// Fixed byte offsets within a SAS Attestation account body (mirror of
// `sas_layout` in programs/accord/src/attestation.rs — keep in sync).
const DISC_OFF = 0; // u8
const NONCE_OFF = 1; // 32 raw bytes
const CREDENTIAL_OFF = 33; // Address
const SCHEMA_OFF = 65; // Address
const DATA_LEN_OFF = 97; // u32 LE
const DATA_OFF = 101; // variable-length `data` starts here
const WALLET_OFF = DATA_OFF; // subject binding = data[0..32]
const WALLET_W = 32;
const SIGNER_W = 32;
const EXPIRY_W = 8; // i64 LE; 0 ⇒ never expires

/** Minimum account length carrying a 32-byte wallet subject + expiry tail. */
export const SAS_ATTESTATION_MIN_LEN = DATA_OFF + WALLET_W + SIGNER_W + EXPIRY_W; // 173

/** Parsed view of a SAS Attestation — the fields the gate checks, plus nonce
 * (issuance id) and signer (credential authority) for display. */
export interface SasAttestation {
  nonce: ReadonlyUint8Array;
  credential: Address;
  schema: Address;
  /** Subject wallet — `data[0..32]` (schema convention: first field). */
  wallet: Address;
  signer: Address;
  /** i64 unix seconds; `0n` ⇒ never expires. */
  expiry: bigint;
}

/**
 * Decode a raw SAS Attestation account body. Throws on malformed input
 * (wrong discriminator, missing wallet binding, truncated tail) — mirrors the
 * on-chain `SasAttestationView::parse` error paths.
 */
export function decodeSasAttestation(
  bytes: ReadonlyUint8Array | Uint8Array,
): SasAttestation {
  const u8 = bytes as Uint8Array;
  if (u8.length < SAS_ATTESTATION_MIN_LEN) {
    throw new Error(
      `SasAttestationMalformed: ${u8.length} < ${SAS_ATTESTATION_MIN_LEN} bytes`,
    );
  }
  if (u8[DISC_OFF] !== SAS_ATTESTATION_DISCRIMINATOR) {
    throw new Error(
      `SasAttestationMalformed: discriminator ${u8[DISC_OFF]} != ${SAS_ATTESTATION_DISCRIMINATOR}`,
    );
  }
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const dataLen = dv.getUint32(DATA_LEN_OFF, true);
  if (dataLen < WALLET_W) {
    throw new Error(
      `SasAttestationMalformed: data_len ${dataLen} < ${WALLET_W} (no wallet binding)`,
    );
  }
  const signerOff = DATA_OFF + dataLen;
  const expiryOff = signerOff + SIGNER_W;
  if (u8.length < expiryOff + EXPIRY_W) {
    throw new Error(`SasAttestationMalformed: truncated expiry tail`);
  }
  const addressDecoder = getAddressDecoder();
  return {
    nonce: u8.slice(NONCE_OFF, NONCE_OFF + WALLET_W),
    credential: addressDecoder.decode(
      u8.subarray(CREDENTIAL_OFF, CREDENTIAL_OFF + WALLET_W),
    ),
    schema: addressDecoder.decode(
      u8.subarray(SCHEMA_OFF, SCHEMA_OFF + WALLET_W),
    ),
    wallet: addressDecoder.decode(
      u8.subarray(WALLET_OFF, WALLET_OFF + WALLET_W),
    ),
    signer: addressDecoder.decode(u8.subarray(signerOff, signerOff + SIGNER_W)),
    expiry: dv.getBigInt64(expiryOff, true),
  };
}

/** Server-side pre-filters for {@link findSasAttestations} — each is a memcmp
 * over a fixed-offset field, so the RPC never ships accounts that can't match. */
export interface SasAttestationFilters {
  /** Only attestations binding this subject wallet (`data[0..32]`). */
  wallet?: Address;
  /** Only attestations issued under this credential. */
  credential?: Address;
  /** Only attestations issued under this schema. */
  schema?: Address;
}

/**
 * Fetch SAS Attestation accounts, decoded and typed. With no filters this is
 * every attestation on the SAS program (global juror browse); with
 * `{ wallet }` it is one wallet's attestations (juror detail).
 *
 * Malformed accounts are skipped, not thrown — see module doc.
 */
export async function findSasAttestations(
  rpc: Rpc<GetProgramAccountsApi>,
  filters: SasAttestationFilters = {},
): Promise<Account<SasAttestation>[]> {
  const base58 = getBase58Decoder();
  const memcmp: GetProgramAccountsMemcmpFilter[] = [
    {
      memcmp: {
        offset: 0n,
        // Single discriminator byte at offset 0 (SAS uses u8, not Anchor's
        // 8). Kit's base58 decoder yields plain `string`; brand it like
        // query.ts does for the filter's `bytes` field.
        bytes: base58.decode(
          new Uint8Array([SAS_ATTESTATION_DISCRIMINATOR]),
        ) as Base58EncodedBytes,
        encoding: "base58",
      },
    },
  ];
  if (filters.credential !== undefined) {
    memcmp.push(addressFilter(BigInt(CREDENTIAL_OFF), filters.credential));
  }
  if (filters.schema !== undefined) {
    memcmp.push(addressFilter(BigInt(SCHEMA_OFF), filters.schema));
  }
  if (filters.wallet !== undefined) {
    memcmp.push(addressFilter(BigInt(WALLET_OFF), filters.wallet));
  }
  const accountInfos = await rpc
    .getProgramAccounts(SAS_PROGRAM_ID, { encoding: "base64", filters: memcmp })
    .send();
  const base64 = getBase64Encoder();
  const out: Account<SasAttestation>[] = [];
  for (const info of accountInfos) {
    try {
      const [data] = info.account.data;
      out.push({
        ...info.account,
        address: info.pubkey,
        programAddress: SAS_PROGRAM_ID,
        data: decodeSasAttestation(base64.encode(data)),
      } as Account<SasAttestation>);
    } catch {
      // Malformed foreign account (see module doc) — skip, don't fail the scan.
    }
  }
  return out;
}
