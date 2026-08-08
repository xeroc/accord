/**
 * Typed single-account reads over a raw Kit RPC (read-only — no signer).
 *
 * The SDK exports decoders but its facade-bound `fetchSubaccord(accord, addr)`
 * needs an `Accord` instance (which carries a signer) and its raw-rpc fetcher
 * isn't built yet (accord-siul). Detail views are read-only, so they decode via
 * the exported codec directly — same pattern `findAllSubaccords` uses internally
 * (no manual byte offsets; the decoder is the SDK's typed surface).
 */
import {
  getBase64Encoder,
  type Address,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import { getSubaccordDecoder } from "@useaccord/sdk";

/** Decoded Subaccord, or `null` if the account doesn't exist at `address`. */
export async function fetchSubaccord(rpc: Rpc<SolanaRpcApi>, address: Address) {
  const res = await rpc.getAccountInfo(address, { encoding: "base64" }).send();
  if (!res.value) return null;
  const [data] = res.value.data;
  return getSubaccordDecoder().decode(getBase64Encoder().encode(data));
}

/** The Subaccord struct as decoded from chain (all account fields). */
export type SubaccordView = NonNullable<
  Awaited<ReturnType<typeof fetchSubaccord>>
>;
