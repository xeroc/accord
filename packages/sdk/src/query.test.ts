// query.test.ts — runnable self-check for the getProgramAccounts offset logic.
// The memcmp filters only work if OFFSET_FIRST_ADDRESS (8) and
// OFFSET_SECOND_ADDRESS (40) point at the real Address fields in the encoded
// account. This round-trips a JurorStake through its generated encoder and
// asserts the bytes at those offsets match the encoded addresses — the smallest
// check that fails if the struct layout drifts. Excluded from the build; run
// via: pnpm --filter @useaccord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddressEncoder, type Address } from "@solana/kit";
import { getJurorStakeEncoder } from "./generated/accounts/index.js";

// A 32-byte Address field follows the 8-byte discriminator; the next at 40.
const OFFSET_FIRST_ADDRESS = 8;
const OFFSET_SECOND_ADDRESS = 40;

const A = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
const B = "SysvarRent111111111111111111111111111111111" as Address;

test("JurorStake address offsets match the encoded struct layout", () => {
  const encoded = getJurorStakeEncoder().encode({
    subaccord: A,
    juror: B,
    staked: 1n,
    activeDraws: 0,
    bump: 0,
    treeIndex: 0,
    stakeDelta: 0n,
    slashReserve: 0n,
    withdrawRequestedAt: 0n,
    pendingWithdrawal: 0n,
    feesEarned: 0n,
  });
  const addrEnc = getAddressEncoder();
  // subaccord (first field after discriminator) lands at offset 8.
  const subaccordBytes = encoded.subarray(
    OFFSET_FIRST_ADDRESS,
    OFFSET_FIRST_ADDRESS + 32,
  );
  assert.deepEqual(subaccordBytes, addrEnc.encode(A));
  // juror (second field) lands at offset 40.
  const jurorBytes = encoded.subarray(
    OFFSET_SECOND_ADDRESS,
    OFFSET_SECOND_ADDRESS + 32,
  );
  assert.deepEqual(jurorBytes, addrEnc.encode(B));
});
