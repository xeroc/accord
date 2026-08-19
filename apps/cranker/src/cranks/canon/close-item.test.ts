/**
 * close-item.test.ts — dispatch tests for the canon GC crank (bean
 * accord-m5fd).
 *
 * Drives the registered executor through a real `CrankDispatch` with a fake
 * RPC (base64-encoded synthetic CanonItems, per-account lamports) and a
 * capturing `sendIx`. Asserts: the happy close (one tx, caller + item
 * metas), the not-Removed skips for every live state, the profitability
 * guard, the already-closed skip, and the canon program-id override.
 */
import { test, expect } from "bun:test";
import {
  address,
  type AccountMeta,
  type Address,
  type Instruction,
  type ReadonlyUint8Array,
} from "@solana/kit";
import { CANON_PROGRAM_ID, getCanonItemEncoder, ItemState, type CanonItem } from "@useaccord/canon";

import { createCrankDispatch, type CrankContext } from "../../dispatch.js";
import { execute, MIN_CLOSE_PROFIT_LAMPORTS, register } from "./close-item.js";

const ITEM = address("Canon11111111111111111111111111111111111111");
const CALLER = address("c8fpTXm3XTRgE5maYQ24Li4L65wMYvAFomzXknxVEx7");
const A = address("11111111111111111111111111111111");
const HEALTHY_RENT = 2_700_000n;

function canonItem(over: Partial<CanonItem> = {}): CanonItem {
  return {
    discriminator: new Uint8Array(8),
    account: A,
    list: address("List111111111111111111111111111111111111111"),
    submitter: A,
    state: ItemState.Removed,
    accumulatedStake: 0n,
    submittedAt: 0n,
    challengeCount: 0,
    activeDispute: A,
    challenger: A,
    challengeStake: 0n,
    challengedAt: 0n,
    withdrawalRequestedAt: { __option: "None" },
    bump: 0,
    ...over,
  } as CanonItem;
}

/** Minimal `getAccountInfo`-only RPC over synthetic accounts with lamports. */
function fakeRpc(accounts: Map<Address, { data: ReadonlyUint8Array; lamports: bigint } | null>) {
  return {
    getAccountInfo: (a: Address) => ({
      send: async () => {
        const acc = accounts.get(a);
        if (acc == null) return { value: null };
        return {
          value: {
            lamports: acc.lamports,
            data: [btoa(String.fromCharCode(...acc.data)), "base64"],
            owner: A,
            rentEpoch: 0n,
            executable: false,
            space: BigInt(acc.data.length),
          },
        };
      },
    }),
  };
}

function harness(
  item: CanonItem,
  opts: { lamports?: bigint; canonProgramId?: Address } = {},
): { ctx: CrankContext; sent: Instruction[]; skips: string[] } {
  const accounts = new Map<Address, { data: ReadonlyUint8Array; lamports: bigint } | null>();
  accounts.set(ITEM, {
    data: getCanonItemEncoder().encode(item as never),
    lamports: opts.lamports ?? HEALTHY_RENT,
  });
  const sent: Instruction[] = [];
  const skips: string[] = [];
  const ctx = {
    accord: {} as never,
    programId: A,
    cranker: CALLER,
    oracleQueue: A,
    programIdentity: A,
    signer: { address: CALLER },
    sendIx: async (ix: Instruction) => {
      sent.push(ix);
      return `sig-${sent.length}`;
    },
    log: (_kind: string, _subject: Address | null, detail: string) => skips.push(detail),
    rpc: fakeRpc(accounts),
    rpcSubscriptions: {} as never,
    canonProgramId: opts.canonProgramId,
  } as unknown as CrankContext;
  return { ctx, sent, skips };
}

function metas(ix: Instruction): Address[] {
  return (ix.accounts as AccountMeta[]).map((m) => m.address);
}

test("Removed + profitable → one close_item tx with caller + item", async () => {
  const { ctx, sent, skips } = harness(canonItem());
  const d = createCrankDispatch();
  register(d);
  const handled = await d.execute(ctx, { kind: "canon_close_item", item: ITEM });
  expect(handled).toBe(true);
  expect(sent.length).toBe(1);
  expect(metas(sent[0]!)).toEqual([CALLER, ITEM]);
  expect(sent[0]!.programAddress).toBe(CANON_PROGRAM_ID);
  expect(skips.join(" | ")).not.toContain("skipped:");
});

test("every live state → skipped, no tx (close would revert NotRemoved)", async () => {
  for (const state of [
    ItemState.Pending,
    ItemState.Listed,
    ItemState.WithdrawPending,
    ItemState.Disputed,
  ]) {
    const { ctx, sent } = harness(canonItem({ state }));
    const res = await execute(ctx, { kind: "canon_close_item", item: ITEM });
    expect(res).toHaveProperty("skipped");
    expect(sent.length).toBe(0);
  }
});

test("rent at or below fee + margin → skipped (unprofitable)", async () => {
  const { ctx, sent } = harness(canonItem(), { lamports: MIN_CLOSE_PROFIT_LAMPORTS });
  const res = await execute(ctx, { kind: "canon_close_item", item: ITEM });
  expect(res.skipped).toContain("unprofitable");
  expect(sent.length).toBe(0);
});

test("missing account → skipped as already closed (post-close notifications)", async () => {
  // An empty account map: the item PDA no longer exists on-chain.
  const accounts = new Map<Address, { data: ReadonlyUint8Array; lamports: bigint } | null>();
  const sent: Instruction[] = [];
  const ctx = {
    accord: {} as never,
    programId: A,
    cranker: CALLER,
    oracleQueue: A,
    programIdentity: A,
    signer: { address: CALLER },
    sendIx: async (ix: Instruction) => {
      sent.push(ix);
      return `sig-${sent.length}`;
    },
    log: () => {},
    rpc: fakeRpc(accounts),
    rpcSubscriptions: {} as never,
  } as unknown as CrankContext;
  const res = await execute(ctx, { kind: "canon_close_item", item: ITEM });
  expect(res.skipped).toContain("already closed");
  expect(sent.length).toBe(0);
});

test("canonProgramId override → instruction targets the override", async () => {
  const other = address("C1ose222222222222222222222222222222222222222");
  const { ctx, sent } = harness(canonItem(), { canonProgramId: other });
  await execute(ctx, { kind: "canon_close_item", item: ITEM });
  expect(sent.length).toBe(1);
  expect(sent[0]!.programAddress).toBe(other);
});
