/**
 * config.test.ts — unit tests for the jurat env schema (bean accord-jxpn):
 * defaults, DRY_RUN default-ON semantics, and every validation error path.
 * Env is injected, never read from process.env.
 */
import { test, expect } from "bun:test";
import { loadConfig, type Config } from "./config";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const VALID_ENV: Record<string, string> = {
  JURAT_RPC_URL: "http://127.0.0.1:8899",
  JURAT_KEYPAIR_PATH: "~/.config/solana/jurat.json",
  JURAT_LLM_BASE_URL: "http://llm.internal/v1",
  JURAT_LLM_API_KEY: "sk-test",
  JURAT_LLM_MODEL: "test-model",
  JURAT_STAKING_TOKENS: USDC,
  JURAT_FEE_TOKENS: USDC,
  JURAT_STAKE_BUDGET: "1000000000",
  JURAT_SUBACCORD_CAP: "500000000",
  JURAT_RESERVE_FLOOR: "100000000",
};

function load(env: Record<string, string | undefined> = VALID_ENV): Config {
  return loadConfig(env);
}

test("parses a full env with every optional group set", () => {
  const config = load({
    ...VALID_ENV,
    JURAT_LLM_FALLBACK_BASE_URL: "http://fallback.internal/v1",
    JURAT_LLM_FALLBACK_API_KEY: "sk-fallback",
    JURAT_LLM_FALLBACK_MODEL: "fallback-model",
    JURAT_MCP_SERVERS_PATH: "./mcp-servers.json",
    JURAT_TELEGRAM_TOKEN: "bot-token",
    JURAT_TELEGRAM_CHAT_ID: "12345",
    JURAT_EVIDENCE_URL: "http://evidence.internal",
    JURAT_DELIVERY_KEY_PATH: "./delivery.key",
    JURAT_SCAN_INTERVAL_MS: "30000",
    JURAT_MIN_SOL_LAMPORTS: "100000000",
    JURAT_MIN_STAKE_MIN: "1000",
    JURAT_MIN_STAKE_MAX: "9000",
    JURAT_FEE_PER_JUROR_MIN: "10",
    JURAT_FEE_PER_JUROR_MAX: "90",
    JURAT_ALPHA_BPS_CAP: "1500",
    JURAT_COMMIT_WINDOW_FLOOR: "3600",
    JURAT_DRY_RUN: "false",
    JURAT_STATE_DIR: "/var/lib/jurat",
  });
  expect(config.llmFallback).toEqual({
    baseUrl: "http://fallback.internal/v1",
    apiKey: "sk-fallback",
    model: "fallback-model",
  });
  expect(config.evidence).toEqual({
    endpoint: "http://evidence.internal",
    deliveryKeyPath: "./delivery.key",
  });
  expect(config.telegram).toEqual({ token: "bot-token", chatId: "12345" });
  expect(config.joinGates).toEqual({
    stakingTokens: [USDC],
    feeTokens: [USDC],
    minStakeMin: 1000n,
    minStakeMax: 9000n,
    feePerJurorMin: 10n,
    feePerJurorMax: 90n,
    alphaBpsCap: 1500,
    commitWindowFloorSec: 3600,
    stakeBudget: 1000000000n,
    subaccordCap: 500000000n,
    reserveFloor: 100000000n,
  });
  expect(config.dryRun).toBe(false);
  expect(config.stateDir).toBe("/var/lib/jurat");
  expect(config.scanIntervalMs).toBe(30000);
  expect(config.minSolLamports).toBe(100000000n);
});

test("defaults: minimal env → dryRun ON, sane floors, optional groups absent", () => {
  const config = load();
  expect(config.dryRun).toBe(true);
  expect(config.stateDir).toBe("./state");
  expect(config.llmFallback).toBeUndefined();
  expect(config.mcpServersPath).toBeUndefined();
  expect(config.telegram).toBeUndefined();
  expect(config.joinGates.feePerJurorMin).toBe(0n);
  expect(config.joinGates.feePerJurorMax).toBeUndefined();
  expect(config.joinGates.alphaBpsCap).toBe(2000);
  expect(config.joinGates.commitWindowFloorSec).toBe(600);
});

test("dryRun accepts explicit true/false/0/no", () => {
  expect(load({ ...VALID_ENV, JURAT_DRY_RUN: "true" }).dryRun).toBe(true);
  expect(load({ ...VALID_ENV, JURAT_DRY_RUN: "0" }).dryRun).toBe(false);
  expect(load({ ...VALID_ENV, JURAT_DRY_RUN: "NO" }).dryRun).toBe(false);
});
test("devtools: default off, 1/true enable, garbage stays off", () => {
  expect(load().devtools).toBe(false);
  expect(load({ ...VALID_ENV, JURAT_DEVTOOLS: "1" }).devtools).toBe(true);
  expect(load({ ...VALID_ENV, JURAT_DEVTOOLS: "true" }).devtools).toBe(true);
  expect(load({ ...VALID_ENV, JURAT_DEVTOOLS: "maybe" }).devtools).toBe(false);
});

test("logfire: default off, service name defaults to jurat", () => {
  expect(load().logfire).toBe(false);
  expect(load().logfireService).toBe("jurat");
});

test("logfire: 1/true enable, garbage stays off", () => {
  expect(load({ ...VALID_ENV, JURAT_LOGFIRE: "1" }).logfire).toBe(true);
  expect(load({ ...VALID_ENV, JURAT_LOGFIRE: "true" }).logfire).toBe(true);
  expect(load({ ...VALID_ENV, JURAT_LOGFIRE: "maybe" }).logfire).toBe(false);
});

test("logfire: JURAT_LOGFIRE_SERVICE overrides the default", () => {
  expect(load({ ...VALID_ENV, JURAT_LOGFIRE_SERVICE: "jurat-devnet" }).logfireService).toBe(
    "jurat-devnet",
  );
  expect(load({ ...VALID_ENV, JURAT_LOGFIRE_SERVICE: "   " }).logfireService).toBe("jurat");
});

test("dryRun garbage throws rather than silently disarming the gate", () => {
  expect(() => load({ ...VALID_ENV, JURAT_DRY_RUN: "maybe" })).toThrow(/JURAT_DRY_RUN/);
});

test("missing required var throws with its name", () => {
  for (const key of [
    "JURAT_RPC_URL",
    "JURAT_KEYPAIR_PATH",
    "JURAT_LLM_BASE_URL",
    "JURAT_LLM_API_KEY",
    "JURAT_LLM_MODEL",
    "JURAT_STAKING_TOKENS",
    "JURAT_FEE_TOKENS",
    "JURAT_STAKE_BUDGET",
    "JURAT_SUBACCORD_CAP",
  ]) {
    const env = { ...VALID_ENV };
    delete env[key];
    expect(() => load(env)).toThrow(key);
  }
});

test("partial evidence pair throws", () => {
  expect(() => load({ ...VALID_ENV, JURAT_EVIDENCE_URL: "http://evidence.internal" })).toThrow(
    "JURAT_EVIDENCE_URL and JURAT_DELIVERY_KEY_PATH must be set together",
  );
});

test("defaults: scan interval 60s, SOL fee floor, evidence absent", () => {
  const config = load();
  expect(config.scanIntervalMs).toBe(60_000);
  expect(config.minSolLamports).toBe(50_000_000n);
  expect(config.evidence).toBeUndefined();
});

test("blank required var counts as missing", () => {
  expect(() => load({ ...VALID_ENV, JURAT_RPC_URL: "   " })).toThrow("JURAT_RPC_URL");
});

test("token allowlist must contain at least one mint", () => {
  expect(() => load({ ...VALID_ENV, JURAT_STAKING_TOKENS: "," })).toThrow("JURAT_STAKING_TOKENS");
});

test("multi-entry allowlists split and trim", () => {
  const config = load({
    ...VALID_ENV,
    JURAT_FEE_TOKENS: " MintA , MintB,,\n",
  });
  expect(config.joinGates.feeTokens).toEqual(["MintA", "MintB"]);
});

test("partial LLM fallback trio throws", () => {
  expect(() => load({ ...VALID_ENV, JURAT_LLM_FALLBACK_BASE_URL: "http://fallback/v1" })).toThrow(
    /FALLBACK.*together/,
  );
});

test("partial telegram pair throws", () => {
  expect(() => load({ ...VALID_ENV, JURAT_TELEGRAM_TOKEN: "bot-token" })).toThrow(
    /TELEGRAM.*together/,
  );
});

test("inverted stake range throws", () => {
  expect(() =>
    load({ ...VALID_ENV, JURAT_MIN_STAKE_MIN: "100", JURAT_MIN_STAKE_MAX: "50" }),
  ).toThrow(/MIN_STAKE_MAX/);
});

test("inverted fee range throws", () => {
  expect(() =>
    load({ ...VALID_ENV, JURAT_FEE_PER_JUROR_MIN: "100", JURAT_FEE_PER_JUROR_MAX: "99" }),
  ).toThrow(/FEE_PER_JUROR_MAX/);
});

test("malformed integers and bigints throw with their var name", () => {
  expect(() => load({ ...VALID_ENV, JURAT_ALPHA_BPS_CAP: "-1" })).toThrow("JURAT_ALPHA_BPS_CAP");
  expect(() => load({ ...VALID_ENV, JURAT_ALPHA_BPS_CAP: "abc" })).toThrow("JURAT_ALPHA_BPS_CAP");
  expect(() => load({ ...VALID_ENV, JURAT_COMMIT_WINDOW_FLOOR: "1.5" })).toThrow(
    "JURAT_COMMIT_WINDOW_FLOOR",
  );
  expect(() => load({ ...VALID_ENV, JURAT_STAKE_BUDGET: "10_000" })).toThrow("JURAT_STAKE_BUDGET");
  expect(() => load({ ...VALID_ENV, JURAT_RESERVE_FLOOR: "-5" })).toThrow("JURAT_RESERVE_FLOOR");
});

test("wsUrl: JURAT_WS_URL wins; otherwise derived from rpcUrl (http→ws, port+1)", () => {
  expect(load().wsUrl).toBe("ws://127.0.0.1:8900");
  expect(load({ ...VALID_ENV, JURAT_WS_URL: "wss://ws.provider.io" }).wsUrl).toBe(
    "wss://ws.provider.io",
  );
  expect(load({ ...VALID_ENV, JURAT_RPC_URL: "https://api.mainnet-beta.solana.com" }).wsUrl).toBe(
    "wss://api.mainnet-beta.solana.com",
  );
});
