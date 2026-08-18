/**
 * utils.test.ts — scaffold smoke test for the shadcn `cn` helper.
 *
 * Pure functions (no RPC, no React) — run via `node --import tsx --test`.
 * Keeps the package `test` glob non-empty until feature tests land.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { cn } from "./utils.js";

test("cn: merges conditional classes", () => {
  assert.equal(cn("a", false && "b", undefined, "c"), "a c");
});

test("cn: last conflicting tailwind class wins", () => {
  assert.equal(cn("px-2", "px-4"), "px-4");
});

test("cn: non-conflicting classes pass through", () => {
  assert.equal(cn("px-2", "text-amber"), "px-2 text-amber");
});
