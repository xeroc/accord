/**
 * log.test.ts — pins the stamped JSON-line contract: every emitted line is
 * valid JSON carrying a parseable ISO-8601 `time` plus `msg` and fields.
 */
import { test, expect } from "bun:test";

import { log } from "./log.js";

test("log emits a JSON line with an ISO-8601 time, msg, and fields", () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (line: string) => lines.push(line);
  try {
    log("crank fired", { kind: "canon_settle_item" });
  } finally {
    console.log = original;
  }
  const parsed = JSON.parse(lines[0]!) as { time: string; msg: string; kind: string };
  expect(parsed.msg).toBe("crank fired");
  expect(parsed.kind).toBe("canon_settle_item");
  // ISO-8601 UTC with ms precision — `Date.parse` accepts it, round-trips to Date.
  const t = Date.parse(parsed.time);
  expect(Number.isNaN(t)).toBe(false);
  expect(new Date(t).toISOString()).toBe(parsed.time);
});
