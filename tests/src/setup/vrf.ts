// vrf.ts — inject a committed VRF + frozen accumulator root into a Dispute
// (the e2e equivalent of the LiteSVM `inject_vrf_freeze`).
//
// The on-chain `request_vrf` (lib.rs) CPIs the magicblock/ephemeral VRF oracle,
// which is not deployed on a Surfnet — so `request_vrf` reverts there. For
// draw / commit-reveal / appeal e2e we instead write `committed_vrf` +
// `frozen_root` + `frozen_total_stake` directly via the `surfnet_setAccount`
// cheatcode, decoding + re-encoding the Dispute account with the generated
// codec.
//
// ADR-0012: `commit_vrf_callback` freezes the live accumulator root atomically
// with the VRF. All `draw_seat` calls for every round select against this one
// frozen root. The caller must supply the Subaccord's live root + total stake.

import {
  ACCORD_PROGRAM_ID,
  getDisputeDecoder,
  getDisputeEncoder,
} from "@useaccord/sdk";
import type { Address } from "@solana/kit";

import { setAccountRaw } from "./cheats.js";
import type { TestEnv } from "./env.js";

/**
 * Set `dispute.committed_vrf = vrf` AND `dispute.frozen_root` /
 * `dispute.frozen_total_stake` in-place on the Surfnet, preserving every other
 * field. `vrf` must be 32 bytes. Use after `create_dispute`, before `draw_seat`.
 *
 * `frozenRoot` + `frozenTotalStake` must match the Subaccord's live accumulator
 * state at the time of the (mocked) VRF callback — read from `subaccord.rootHash`
 * + `subaccord.totalStake`.
 */
export async function injectCommittedVrf(
  env: TestEnv,
  dispute: Address,
  vrf: Uint8Array,
  frozenRoot: Uint8Array,
  frozenTotalStake: bigint,
): Promise<void> {
  if (vrf.length !== 32) {
    throw new Error(`committedVrf must be 32 bytes (got ${vrf.length})`);
  }
  if (frozenRoot.length !== 32) {
    throw new Error(`frozenRoot must be 32 bytes (got ${frozenRoot.length})`);
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
    frozenRoot,
    frozenTotalStake,
  });

  await setAccountRaw(env, dispute, {
    lamports: account.value.lamports,
    data: new Uint8Array(reencoded),
    owner: ACCORD_PROGRAM_ID,
    executable: false,
  });
}
