// log.test.ts — env level parse: default, both var names, case/space
// tolerance, and the typo guard (a bad level must throw, not mute).
// Run via: pnpm --filter @useaccord/jurat test
import { test } from "node:test";
import assert from "node:assert/strict";
import { LOG_LEVELS, envLogLevel } from "./log.ts";

test("envLogLevel: unset → info", () => {
  assert.equal(envLogLevel({}), "info");
});

test("envLogLevel: JURAT_LOG_LEVEL wins, LOG_LEVEL fallback", () => {
  assert.equal(envLogLevel({ JURAT_LOG_LEVEL: "debug" }), "debug");
  assert.equal(envLogLevel({ LOG_LEVEL: "verbose" }), "verbose");
  assert.equal(envLogLevel({ JURAT_LOG_LEVEL: "debug", LOG_LEVEL: "error" }), "debug");
});

test("envLogLevel: case/whitespace tolerant, full level set accepted", () => {
  for (const level of LOG_LEVELS) {
    assert.equal(envLogLevel({ JURAT_LOG_LEVEL: ` ${level.toUpperCase()} ` }), level);
  }
});

test("envLogLevel: typo throws, never silently mutes", () => {
  assert.throws(() => envLogLevel({ JURAT_LOG_LEVEL: "dbg" }), /JURAT_LOG_LEVEL/);
});
