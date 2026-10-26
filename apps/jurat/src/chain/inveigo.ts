// inveigo.ts — read-only Inveigo case resolution for `read_case` (bean
// accord-z801 extension): given only a Dispute PDA, resolve the Inveigo boss
// Item it belongs to and fetch the ORIGINAL THESIS document the attacker is
// attacking. Inveigo disputes carry only the challenger's anti-thesis in the
// round-0 evidence bundle; the thesis lives on the evidence daemon's public
// CAS, keyed by `Item.claim_hash` — this module is the juror's authoritative
// bridge to it.
//
// Resolution (ADR note: the Dispute points at nothing Inveigo-shaped; the
// link is the reverse field `Item.current_dispute`, unique and live exactly
// while the challenge is in flight — the voting window):
//
//   1. one getProgramAccounts scan over the Inveigo program, memcmp-filtered
//      on the Item discriminator (offset 0) and the dispute pubkey at offset
//      138 — the same cross-program pattern as `findSasAttestation`;
//   2. decode the Item at the fixed borsh offsets below;
//   3. GET `{endpoint}/domains/{claim_hash}` (content-addressed CAS) and
//      gate on sha256(bytes) === Item.claim_hash — a tampered or wrong
//      document throws; only hash-exact bytes are ever returned.
//
// The offsets mirror `Item` in inveigo `programs/inveigo/src/state.rs`
// (declaration order, borsh packs without padding). state.rs is append-only
// at the tail, so late fields never shift these offsets — front-loaded
// changes are caught by the drift-pin test in that repo's `src/tests.rs`
// (`layout_pins`), which must be updated in the same change as this file.
import { createHash } from "node:crypto";

import {
  type Address,
  type Base64EncodedBytes,
  getAddressDecoder,
  getAddressEncoder,
  type GetProgramAccountsApi,
  parseBase64RpcAccount,
  type ReadonlyUint8Array,
  type Rpc,
} from "@solana/kit";

/** Inveigo program (same deploy identity across localnet/devnet). */
export const INVEIGO_PROGRAM_ID = "invTbwsjGxFRUDotpn3i6twQ6spJgPFrCKEQ8MV1bqZ" as Address;

/** sha256("account:Item")[0..8] — pinned by inveigo `tests.rs::layout_pins`. */
const ITEM_DISCRIMINATOR: ReadonlyUint8Array = new Uint8Array([
  92, 157, 163, 130, 72, 254, 86, 216,
]);

// Fixed offsets in the encoded Item account (8-byte discriminator, then
// borsh fields in state.rs order): creator@8 nonce@40 claim_hash@48 seed@80
// pot@88 flip_outcome@96 expires_at@97 subaccord@105 state@137
// current_dispute@138 challenger@170 defense_count@202 mint@206
// creator_share_bps@238 bump@240 challenge_window_secs@241.
const CLAIM_HASH_OFFSET = 48;
const EXPIRES_AT_OFFSET = 97;
const SUBACCORD_OFFSET = 105;
const STATE_OFFSET = 137;
const CURRENT_DISPUTE_OFFSET = 138;
const CHALLENGER_OFFSET = 170;
const DEFENSE_COUNT_OFFSET = 202;
const MINT_OFFSET = 206;
const CREATOR_SHARE_BPS_OFFSET = 238;
const CHALLENGE_WINDOW_OFFSET = 241;

/** 8 + Item::INIT_SPACE — accounts shorter than this cannot be an Item. */
export const ITEM_DATA_LEN = 249;

/** ItemState borsh variant indexes (append-only — unknown indexes degrade). */
const ITEM_STATES = ["Active", "Challenging", "Flipped", "TimedOut", "Withdrawn"] as const;

/** Decoded view of the fields `read_case` serves; u64s as decimal strings. */
export interface InveigoItemView {
  address: Address;
  creator: Address;
  nonce: string;
  /** sha256 of the thesis manifest — lowercase hex, the CAS route key. */
  claimHash: string;
  seed: string;
  pot: string;
  expiresAt: string;
  subaccord: Address;
  state: string;
  currentDispute: Address | null;
  challenger: Address | null;
  defenseCount: number;
  mint: Address;
  creatorShareBps: number;
  challengeWindowSecs: string;
}

/** What `read_case` returns to the agent. */
export interface InveigoCase {
  protocol: "inveigo";
  dispute: Address;
  item: InveigoItemView;
  /**
   * The thesis manifest (frontmatter + body) from the public CAS,
   * sha256-verified against `Item.claim_hash`. `null` = the CAS has no
   * document at the claim hash (definitively absent — the boss's thesis was
   * never uploaded or is lost). Anything uncertain (transport, non-404
   * status, hash mismatch) throws instead: never a maybe-thesis.
   */
  thesis: string | null;
  checks: {
    /** `Item.subaccord === ` the Subaccord the dispute lives in; `null` when the caller supplied no expectation. */
    courtMatches: boolean | null;
  };
}

/** Thrown on layout violations and CAS integrity failures — abstain-worthy. */
export class InveigoCaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InveigoCaseError";
  }
}

/** memcmp filter bytes are base64 (kit convention, see queries.ts). */
function memcmpBytes(bytes: ReadonlyUint8Array): Base64EncodedBytes {
  return btoa(String.fromCharCode(...bytes)) as Base64EncodedBytes;
}

/** Bytes → lowercase hex (the CAS route-key shape). */
function toHex(bytes: ReadonlyUint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isAllZero(bytes: ReadonlyUint8Array): boolean {
  return bytes.every((b) => b === 0);
}

/** Decode an Item account at the fixed offsets. Throws on short bytes or a
 *  foreign discriminator — never guesses a field. */
export function decodeItemView(bytes: ReadonlyUint8Array, address: Address): InveigoItemView {
  if (bytes.length < ITEM_DATA_LEN) {
    throw new InveigoCaseError(
      `Item account ${address} is ${bytes.length} bytes (< ${ITEM_DATA_LEN})`,
    );
  }
  const discriminator = bytes.subarray(0, 8);
  if (!discriminator.every((b, i) => b === ITEM_DISCRIMINATOR[i])) {
    throw new InveigoCaseError(`account ${address} does not carry the Item discriminator`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decodeAddress = (offset: number): Address =>
    getAddressDecoder().decode(bytes.subarray(offset, offset + 32));
  const currentDisputeBytes = bytes.subarray(CURRENT_DISPUTE_OFFSET, CURRENT_DISPUTE_OFFSET + 32);
  const challengerBytes = bytes.subarray(CHALLENGER_OFFSET, CHALLENGER_OFFSET + 32);
  const stateByte = bytes[STATE_OFFSET]!;
  return {
    address,
    creator: decodeAddress(8),
    nonce: String(view.getBigUint64(40, true)),
    claimHash: toHex(bytes.subarray(CLAIM_HASH_OFFSET, CLAIM_HASH_OFFSET + 32)),
    seed: String(view.getBigUint64(80, true)),
    pot: String(view.getBigUint64(88, true)),
    expiresAt: String(view.getBigInt64(EXPIRES_AT_OFFSET, true)),
    subaccord: decodeAddress(SUBACCORD_OFFSET),
    state: ITEM_STATES[stateByte] ?? `unknown(${stateByte})`,
    currentDispute: isAllZero(currentDisputeBytes) ? null : decodeAddress(CURRENT_DISPUTE_OFFSET),
    challenger: isAllZero(challengerBytes) ? null : decodeAddress(CHALLENGER_OFFSET),
    defenseCount: view.getUint32(DEFENSE_COUNT_OFFSET, true),
    mint: decodeAddress(MINT_OFFSET),
    creatorShareBps: view.getUint16(CREATOR_SHARE_BPS_OFFSET, true),
    challengeWindowSecs: String(view.getBigInt64(CHALLENGE_WINDOW_OFFSET, true)),
  };
}

/**
 * Resolve the Inveigo case for a dispute: the boss Item (via the unique,
 * live-only-during-the-challenge `Item.current_dispute` link) plus the
 * claim-hash-verified thesis. `null` when no Item carries the dispute — the
 * dispute is not an Inveigo challenge.
 */
export async function readInveigoCase(params: {
  rpc: Rpc<GetProgramAccountsApi>;
  endpoint: string;
  dispute: Address;
  /** The Subaccord the dispute lives in (from the duty) — enables the court check. */
  expectedSubaccord?: Address;
}): Promise<InveigoCase | null> {
  const found = await params.rpc
    .getProgramAccounts(INVEIGO_PROGRAM_ID, {
      encoding: "base64",
      filters: [
        {
          memcmp: {
            offset: 0n,
            bytes: memcmpBytes(ITEM_DISCRIMINATOR),
            encoding: "base64",
          },
        },
        {
          memcmp: {
            offset: BigInt(CURRENT_DISPUTE_OFFSET),
            bytes: memcmpBytes(getAddressEncoder().encode(params.dispute)),
            encoding: "base64",
          },
        },
      ],
    })
    .send();

  if (found.length === 0) return null;
  if (found.length > 1) {
    throw new InveigoCaseError(
      `inveigo: ${found.length} Items claim dispute ${params.dispute} — ` +
        "current_dispute is unique by program invariant",
    );
  }

  const { pubkey, account } = found[0]!;
  const bytes = parseBase64RpcAccount(pubkey as Address, account).data;
  const item = decodeItemView(bytes, pubkey as Address);

  const thesis = await fetchVerifiedThesis(
    params.endpoint,
    item.claimHash,
    bytes.subarray(CLAIM_HASH_OFFSET, CLAIM_HASH_OFFSET + 32),
  );

  return {
    protocol: "inveigo",
    dispute: params.dispute,
    item,
    thesis,
    checks: {
      courtMatches:
        params.expectedSubaccord === undefined ? null : item.subaccord === params.expectedSubaccord,
    },
  };
}

/** GET the CAS document at the claim hash; `null` only on a definitive 404.
 *  Any non-hash-exact bytes throw — a maybe-thesis is worse than none. */
async function fetchVerifiedThesis(
  endpoint: string,
  claimHashHex: string,
  claimHashBytes: ReadonlyUint8Array,
): Promise<string | null> {
  const res = await fetch(`${endpoint.replace(/\/+$/, "")}/domains/${claimHashHex}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new InveigoCaseError(`thesis CAS returned ${res.status} for claim ${claimHashHex}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest();
  if (!digest.every((b, i) => b === claimHashBytes[i])) {
    throw new InveigoCaseError(
      `CAS document at ${claimHashHex} does not hash to Item.claim_hash — tampered or wrong document`,
    );
  }
  return new TextDecoder().decode(bytes);
}
