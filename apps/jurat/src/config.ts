/**
 * @useaccord/jurat — env config (bean accord-jxpn, evidence-daemon style).
 *
 * `loadConfig(env)` reads + validates the daemon environment; `env` defaults
 * to `process.env` so tests can inject a deterministic one. Throws on any
 * missing required var, malformed number, partial optional group, or inverted
 * range. All vars are `JURAT_`-prefixed.
 *
 * DRY_RUN defaults to ON (milestone accord-g69g design decision 1): no
 * vote-shaped tx leaves the process unless explicitly opted out. A malformed
 * value throws rather than silently disabling the gate.
 */
export interface LlmEndpointConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

/** Join gates — the full conservative set (design decision 3), all config-driven. */
export interface JoinGatesConfig {
  /** Base58 mints the daemon may stake as collateral (staking_token allowlist). */
  readonly stakingTokens: readonly string[];
  /** Base58 mint allowlist for the Subaccord's fee_token. */
  readonly feeTokens: readonly string[];
  /** Accept pools whose configured min_stake is within [min, max]. */
  readonly minStakeMin: bigint;
  readonly minStakeMax?: bigint;
  /** Accept pools whose fee_per_juror is within [min, max]. */
  readonly feePerJurorMin: bigint;
  readonly feePerJurorMax?: bigint;
  /** Accept pools with alpha_bps ≤ cap (default 2000 = 20%). */
  readonly alphaBpsCap: number;
  /** Accept pools whose commit_window (seconds) ≥ floor — agent runtime budget. */
  readonly commitWindowFloorSec: number;
  /** Total stake the daemon may commit across all Subaccords. */
  readonly stakeBudget: bigint;
  /** Max stake in any single Subaccord. */
  readonly subaccordCap: bigint;
  /** Never stake below this remaining balance in the operator account. */
  readonly reserveFloor: bigint;
}

export interface TelegramConfig {
  readonly token: string;
  readonly chatId: string;
}

/** Evidence daemon access — both vars together or none (unset: verdict pipeline dark). */
export interface EvidenceConfig {
  /** Evidence daemon base URL (ADR-0011). */
  readonly endpoint: string;
  /** X25519 Delivery Key file (ADR-0034), created on first run. */
  readonly deliveryKeyPath: string;
}

/** Trace push (ADR-0037) — unset URL disables tracing entirely (no-op sink). */
export interface TraceConfig {
  /** Evidence-daemon base URL; the sink appends `/trace/:sub/:dispute/:juror`. */
  readonly url: string;
  /** `sealed` withholds verdict frames until `unsealAt`; `open` (demo) releases at push. */
  readonly mode: "sealed" | "open";
}

export interface Config {
  readonly rpcUrl: string;
  /** WS endpoint: JURAT_WS_URL or derived from rpcUrl (http→ws, port+1). */
  readonly wsUrl: string;
  readonly keypairPath: string;
  readonly llm: LlmEndpointConfig;
  /** Retry-ladder rung 2; all three vars together or none. */
  readonly llmFallback?: LlmEndpointConfig;
  /** Path to MCP server definitions JSON (agent tools, design decision 6). */
  readonly mcpServersPath?: string;
  readonly joinGates: JoinGatesConfig;
  /** Both vars together or none. */
  readonly telegram?: TelegramConfig;
  /** Both vars together or none; unset disables evidence intake (join watch still runs). */
  readonly evidence?: EvidenceConfig;
  /** ADR-0037 trace push; unset URL → tracing off (no-op sink). */
  readonly trace?: TraceConfig;
  /** Default true — no vote tx leaves the process unless JURAT_DRY_RUN=false. */
  readonly dryRun: boolean;
  /** JURAT_DEVTOOLS=1|true — register AI SDK DevTools capture (local debug only). */
  readonly devtools: boolean;
  /** JURAT_LOGFIRE=1|true — export OTel spans (AI SDK + daemon) to Pydantic Logfire. */
  readonly logfire: boolean;
  /** Logfire service.name. Default "jurat". */
  readonly logfireService: string;
  readonly stateDir: string;
  /** Reconcile scan interval (ms) — the truth loop. Default 60_000. */
  readonly scanIntervalMs: number;
  /** SOL the operator must retain for tx fees (join executor guard). Default 50_000_000. */
  readonly minSolLamports: bigint;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const llm: LlmEndpointConfig = {
    baseUrl: required(env, "JURAT_LLM_BASE_URL"),
    apiKey: required(env, "JURAT_LLM_API_KEY"),
    model: required(env, "JURAT_LLM_MODEL"),
  };
  const llmFallback = parseFallback(env);

  const telegramToken = env.JURAT_TELEGRAM_TOKEN;
  const telegramChat = env.JURAT_TELEGRAM_CHAT_ID;
  if ((telegramToken === undefined) !== (telegramChat === undefined)) {
    throw new Error("JURAT_TELEGRAM_TOKEN and JURAT_TELEGRAM_CHAT_ID must be set together");
  }

  const evidenceUrl = optional(env.JURAT_EVIDENCE_URL);
  const evidenceKey = optional(env.JURAT_DELIVERY_KEY_PATH);
  if ((evidenceUrl === undefined) !== (evidenceKey === undefined)) {
    throw new Error("JURAT_EVIDENCE_URL and JURAT_DELIVERY_KEY_PATH must be set together");
  }
  const trace = parseTrace(env);
  const joinGates = parseJoinGates(env);

  const rpcUrl = required(env, "JURAT_RPC_URL");

  return {
    rpcUrl,
    wsUrl: optional(env.JURAT_WS_URL) ?? deriveWsUrl(rpcUrl),
    keypairPath: required(env, "JURAT_KEYPAIR_PATH"),
    llm,
    llmFallback,
    mcpServersPath: optional(env.JURAT_MCP_SERVERS_PATH),
    joinGates,
    telegram:
      telegramToken !== undefined && telegramChat !== undefined
        ? { token: telegramToken, chatId: telegramChat }
        : undefined,
    evidence:
      evidenceUrl !== undefined && evidenceKey !== undefined
        ? { endpoint: evidenceUrl, deliveryKeyPath: evidenceKey }
        : undefined,
    trace,
    dryRun: dryRunFlag(env.JURAT_DRY_RUN),
    devtools: env.JURAT_DEVTOOLS === "1" || env.JURAT_DEVTOOLS?.toLowerCase() === "true",
    logfire: env.JURAT_LOGFIRE === "1" || env.JURAT_LOGFIRE?.toLowerCase() === "true",
    logfireService: optional(env.JURAT_LOGFIRE_SERVICE) ?? "jurat",
    stateDir: optional(env.JURAT_STATE_DIR) ?? "./state",
    scanIntervalMs: intFlag(env.JURAT_SCAN_INTERVAL_MS, 60_000, "JURAT_SCAN_INTERVAL_MS"),
    minSolLamports: bigIntFlag(env.JURAT_MIN_SOL_LAMPORTS, 50_000_000n, "JURAT_MIN_SOL_LAMPORTS"),
  };
}

function parseFallback(env: Record<string, string | undefined>): LlmEndpointConfig | undefined {
  const baseUrl = optional(env.JURAT_LLM_FALLBACK_BASE_URL);
  const apiKey = optional(env.JURAT_LLM_FALLBACK_API_KEY);
  const model = optional(env.JURAT_LLM_FALLBACK_MODEL);
  const set = [baseUrl, apiKey, model].filter((v) => v !== undefined).length;
  if (set === 0) return undefined;
  if (set !== 3) {
    throw new Error(
      "JURAT_LLM_FALLBACK_BASE_URL, JURAT_LLM_FALLBACK_API_KEY, and JURAT_LLM_FALLBACK_MODEL must be set together",
    );
  }
  return { baseUrl: baseUrl!, apiKey: apiKey!, model: model! };
}

/** ADR-0037 trace push: URL optional; mode requires the URL and must be sealed|open. */
function parseTrace(env: Record<string, string | undefined>): TraceConfig | undefined {
  const url = optional(env.JURAT_TRACE_URL);
  const mode = optional(env.JURAT_TRACE_MODE);
  if (url === undefined && mode === undefined) return undefined;
  if (url === undefined) {
    throw new Error("JURAT_TRACE_MODE set without JURAT_TRACE_URL");
  }
  if (mode !== undefined && mode !== "sealed" && mode !== "open") {
    throw new Error(`JURAT_TRACE_MODE must be "sealed" or "open", got "${mode}"`);
  }
  return { url, mode: mode ?? "sealed" };
}

function parseJoinGates(env: Record<string, string | undefined>): JoinGatesConfig {
  const minStakeMin = bigIntFlag(env.JURAT_MIN_STAKE_MIN, 0n, "JURAT_MIN_STAKE_MIN");
  const minStakeMax = optionalBigInt(env.JURAT_MIN_STAKE_MAX, "JURAT_MIN_STAKE_MAX");
  const feeMin = bigIntFlag(env.JURAT_FEE_PER_JUROR_MIN, 0n, "JURAT_FEE_PER_JUROR_MIN");
  const feeMax = optionalBigInt(env.JURAT_FEE_PER_JUROR_MAX, "JURAT_FEE_PER_JUROR_MAX");
  if (minStakeMax !== undefined && minStakeMax < minStakeMin) {
    throw new Error("JURAT_MIN_STAKE_MAX must be ≥ JURAT_MIN_STAKE_MIN");
  }
  if (feeMax !== undefined && feeMax < feeMin) {
    throw new Error("JURAT_FEE_PER_JUROR_MAX must be ≥ JURAT_FEE_PER_JUROR_MIN");
  }

  return {
    stakingTokens: tokenList(env, "JURAT_STAKING_TOKENS"),
    feeTokens: tokenList(env, "JURAT_FEE_TOKENS"),
    minStakeMin,
    minStakeMax,
    feePerJurorMin: feeMin,
    feePerJurorMax: feeMax,
    alphaBpsCap: intFlag(env.JURAT_ALPHA_BPS_CAP, 2000, "JURAT_ALPHA_BPS_CAP"),
    commitWindowFloorSec: intFlag(env.JURAT_COMMIT_WINDOW_FLOOR, 600, "JURAT_COMMIT_WINDOW_FLOOR"),
    stakeBudget: requiredBigInt(env, "JURAT_STAKE_BUDGET"),
    subaccordCap: requiredBigInt(env, "JURAT_SUBACCORD_CAP"),
    reserveFloor: requiredBigInt(env, "JURAT_RESERVE_FLOOR"),
  };
}

/** Comma-separated base58 allowlist; at least one entry required. */
function tokenList(env: Record<string, string | undefined>, key: string): string[] {
  const raw = required(env, key);
  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    throw new Error(`${key} must list at least one base58 mint`);
  }
  return tokens;
}

function dryRunFlag(v: string | undefined): boolean {
  if (v === undefined || v.trim().length === 0) return true;
  const t = v.trim().toLowerCase();
  if (t === "1" || t === "true" || t === "yes") return true;
  if (t === "0" || t === "false" || t === "no") return false;
  throw new Error(`JURAT_DRY_RUN must be a boolean, got: ${JSON.stringify(v)}`);
}

function required(env: Record<string, string | undefined>, key: string): string {
  const v = env[key];
  if (v === undefined || v.trim().length === 0) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}

function optional(v: string | undefined): string | undefined {
  return v !== undefined && v.trim().length === 0 ? undefined : v;
}

function intFlag(v: string | undefined, def: number, name: string): number {
  if (v === undefined || v.trim().length === 0) return def;
  return parseNonNegInt(v, name);
}

function parseNonNegInt(v: string, name: string): number {
  const t = v.trim();
  if (!/^\d+$/.test(t)) {
    throw new Error(`${name} must be a non-negative integer, got: ${JSON.stringify(v)}`);
  }
  return Number(t);
}

function parseBigUint(v: string, name: string): bigint {
  const t = v.trim();
  if (!/^\d+$/.test(t)) {
    throw new Error(`${name} must be a non-negative integer, got: ${JSON.stringify(v)}`);
  }
  return BigInt(t);
}

function requiredBigInt(env: Record<string, string | undefined>, key: string): bigint {
  return parseBigUint(required(env, key), key);
}

function bigIntFlag(v: string | undefined, def: bigint, name: string): bigint {
  if (v === undefined || v.trim().length === 0) return def;
  return parseBigUint(v, name);
}

function optionalBigInt(v: string | undefined, name: string): bigint | undefined {
  if (v === undefined || v.trim().length === 0) return undefined;
  return parseBigUint(v, name);
}

/**
 * Derive a WS endpoint from an RPC URL: scheme http→ws / https→wss, port +1
 * (the validator/Surfpool convention, 8899→8900). Hosts without a port keep
 * theirs untouched. Providers with a distinct WS host must set JURAT_WS_URL.
 */
export function deriveWsUrl(rpcUrl: string): string {
  const url = new URL(rpcUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (url.port !== "") {
    url.port = String(Number(url.port) + 1);
  }
  return url.toString().replace(/\/$/, "");
}
