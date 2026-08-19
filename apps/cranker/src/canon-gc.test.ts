/**
 * canon-gc.test.ts — layout pin + query shape for the Removed-item GC scan
 * (bean accord-m5fd).
 *
 * Pins the two things the server-side memcmp filters depend on:
 *   - `CANON_ITEM_STATE_OFFSET` actually points at the `state` byte of the
 *     generated CanonItem encoding (fails if the account layout drifts);
 *   - the GPA scan sends the discriminator + Removed-state filters with a
 *     zero-length dataSlice and returns just the addresses.
 */
import { test, expect } from "bun:test";
import { address, type Address, type GetProgramAccountsApi, type Rpc } from "@solana/kit";
import {
  CANON_ITEM_DISCRIMINATOR,
  getCanonItemEncoder,
  ItemState,
  type CanonItem,
} from "@useaccord/canon";

import {
  CANON_ITEM_STATE_OFFSET,
  canonItemStateFilter,
  findRemovedCanonItemAddresses,
  removedCanonItemFilters,
} from "./canon-gc";

function canonItem(over: Partial<CanonItem> = {}): CanonItem {
  return {
    discriminator: new Uint8Array(8),
    account: "11111111111111111111111111111111" as Address,
    list: "List111111111111111111111111111111111111111" as Address,
    submitter: "11111111111111111111111111111111" as Address,
    state: ItemState.Removed,
    accumulatedStake: 0n,
    submittedAt: 0n,
    challengeCount: 0,
    activeDispute: "11111111111111111111111111111111" as Address,
    challenger: "11111111111111111111111111111111" as Address,
    challengeStake: 0n,
    challengedAt: 0n,
    withdrawalRequestedAt: { __option: "None" },
    bump: 0,
    ...over,
  };
}

test("CANON_ITEM_STATE_OFFSET points at the state byte of the generated encoding", () => {
  for (const state of [
    ItemState.Pending,
    ItemState.Listed,
    ItemState.Removed,
    ItemState.WithdrawPending,
    ItemState.Disputed,
  ]) {
    const encoded = getCanonItemEncoder().encode(canonItem({ state }) as never);
    expect(encoded[Number(CANON_ITEM_STATE_OFFSET)]).toBe(state);
    // And the discriminator still lives at offset 0.
    expect(Array.from(encoded.slice(0, 8))).toEqual(Array.from(CANON_ITEM_DISCRIMINATOR));
  }
});

test("removedCanonItemFilters base64-encode the discriminator + Removed byte", () => {
  const [disc, state] = removedCanonItemFilters();
  expect(disc!.memcmp.offset).toBe(0n);
  expect(atob(disc!.memcmp.bytes as string)).toBe(String.fromCharCode(...CANON_ITEM_DISCRIMINATOR));
  expect(state!.memcmp.offset).toBe(CANON_ITEM_STATE_OFFSET);
  // ItemState.Removed === 2 → single byte 0x02.
  expect(atob(state!.memcmp.bytes as string)).toBe(String.fromCharCode(ItemState.Removed));
  expect(canonItemStateFilter(ItemState.Disputed).memcmp.bytes).not.toBe(state!.memcmp.bytes);
});

test("findRemovedCanonItemAddresses sends the Removed filters + dataSlice and returns addresses", async () => {
  const A = "Canon11111111111111111111111111111111111111" as Address;
  const B = "Canon22222222222222222222222222222222222222" as Address;
  let seenProgram: Address | undefined;
  let seenConfig: unknown;
  const rpc = {
    getProgramAccounts: (programId: Address, config: unknown) => ({
      send: async () => {
        seenProgram = programId;
        seenConfig = config;
        return [
          { pubkey: A, account: { data: ["", "base64"], lamports: 2_700_000n } },
          { pubkey: B, account: { data: ["", "base64"], lamports: 2_700_000n } },
        ];
      },
    }),
  } as unknown as Rpc<GetProgramAccountsApi>;

  const out = await findRemovedCanonItemAddresses(
    rpc,
    address("can5ZhfgQpi7jymkxE7uEv4ZVm3X2f51KThTUtdWrFs"),
  );
  expect(out).toEqual([A, B]);
  expect(seenProgram).toBe(address("can5ZhfgQpi7jymkxE7uEv4ZVm3X2f51KThTUtdWrFs"));
  const cfg = seenConfig as {
    encoding: string;
    filters: ReturnType<typeof removedCanonItemFilters>;
    dataSlice: { offset: number; length: number };
  };
  expect(cfg.encoding).toBe("base64");
  expect(cfg.filters).toEqual(removedCanonItemFilters());
  expect(cfg.dataSlice).toEqual({ offset: 0, length: 0 });
});
