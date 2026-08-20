/**
 * Intra-topic helpers for `canon:*` — account resolution shared by submit /
 * advance-pending / challenge / settle / withdraw. Mirrors `staking-context.ts`:
 * fetch the anchor account (throwing a clear error if missing), then derive
 * every downstream address from real on-chain fields — never re-derive what
 * the account already stores.
 */
import { type Address } from "@solana/kit";

import {
  fetchMaybeCanonItem,
  fetchMaybeCanonList,
  type CanonItem,
  type CanonList,
} from "@useaccord/canon";

import type { ChainContext } from "./lib/base-command.js";

/** A fetched CanonItem + its owning CanonList (the item's `list` back-ref). */
export interface ResolvedItem {
  itemAddress: Address;
  item: CanonItem;
  listAddress: Address;
  list: CanonList;
}

/** Fetch a CanonList or throw a clear error (the CLI maps this via `catch()`). */
export async function requireCanonList(ctx: ChainContext, list: Address): Promise<CanonList> {
  const maybe = await fetchMaybeCanonList(ctx.accord.rpc, list);
  if (!maybe.exists) {
    throw new Error(`CanonListNotFound: ${list} does not exist (create it with canon:create-list)`);
  }
  return maybe.data;
}

/** Fetch a CanonItem + its owning CanonList, or throw. */
export async function resolveItem(ctx: ChainContext, item: Address): Promise<ResolvedItem> {
  const maybe = await fetchMaybeCanonItem(ctx.accord.rpc, item);
  if (!maybe.exists) {
    throw new Error(`CanonItemNotFound: ${item} does not exist`);
  }
  const list = await requireCanonList(ctx, maybe.data.list);
  return { itemAddress: item, item: maybe.data, listAddress: maybe.data.list, list };
}
