/** @type {import('ts-jest').JestConfigWithTsJest} */
// ESM mode: @accord/sdk is an ESM-only package (`"type": "module"`), so jest
// must run with --experimental-vm-modules and the ts-jest ESM preset. @solana/kit
// then resolves to its `.mjs` build. See ADR-0010.
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.spec.ts", "**/*.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  // Integration tests talk to a live validator (test-validator or Surfpool).
  testTimeout: 120000,
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
