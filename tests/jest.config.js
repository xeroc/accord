/** @type {import('ts-jest').JestConfigWithTsJest} */
// ESM mode: @useaccord/sdk is an ESM-only package (`"type": "module"`), so jest
// must run with --experimental-vm-modules and the ts-jest ESM preset. @solana/kit
// then resolves to its `.mjs` build. See ADR-0010.
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.spec.ts", "**/*.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  // Integration tests talk to a live validator (test-validator or Surfpool).
  // SERIAL: `surfnet_timeTravel` advances the GLOBAL clock, and PauseState is a
  // singleton — parallel specs would race on both. See AGENTS.md "green rule".
  maxWorkers: 1,
  testTimeout: 120000,
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
