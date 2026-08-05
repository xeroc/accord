// vrf.ts — inject a committed VRF into a Dispute (the e2e equivalent of the
// LiteSVM `mock_commit_vrf`).
//
// The on-chain `request_vrf` (lib.rs:793) CPIs the magicblock/ephemeral VRF
// oracle, which is not deployed on a Surfnet — so `request_vrf` reverts there.
// For draw / commit-reveal / appeal e2e we instead write `committed_vrf`
// directly via the `surfnet_setAccount` cheatcode, decoding + re-encoding the
// Dispute account with the generated codec (the only caller allowed to set it
// on-chain is the VRF program; this bypasses that for testing).

import {
  ACCORD_PROGRAM_ID,
  getDisputeDecoder,
  getDisputeEncoder,
} from "@accord/sdk";
import type { Address } from "@solana/kit";

import { setAccountRaw } from "./cheats.js";
import type { TestEnv } from "./env.js";

/**
 * Set `dispute.committed_vrf = vrf` in-place on the Surfnet, preserving every
 * other field. `vrf` must be 32 bytes. Use after `create_dispute` + a finalized
 * snapshot, before `draw`.
 */
export async function injectCommittedVrf(
  env: TestEnv,
  dispute: Address,
  vrf: Uint8Array,
): Promise<void> {
  if (vrf.length !== 32) {
    throw new Error(`committedVrf must be 32 bytes (got ${vrf.length})`);
  }

  const account = await env.rpc
    .getAccountInfo(dispute, { encoding: "base64" })
    .send();
  if (!account.value) {
    throw new Error(`Dispute account not found: ${dispute}`);
  }

  const raw = new Uint8Array(Buffer.from(account.value.data[0], "base64"));
  const decoded = getDisputeDecoder().decode(raw);
  const reencoded = getDisputeEncoder().encode({
    ...decoded,
    committedVrf: vrf,
  });

  await setAccountRaw(env, dispute, {
    lamports: account.value.lamports,
    data: new Uint8Array(reencoded),
    owner: ACCORD_PROGRAM_ID,
    executable: false,
  });
}
