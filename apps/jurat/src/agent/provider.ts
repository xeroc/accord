// provider.ts — provider wiring & retry ladder (bean accord-ot16):
// `createOpenAICompatible` models built from configured endpoints, run
// primary → fallback with in-place backoff retries per endpoint
// (milestone decision 6). Exhausting the ladder throws
// `RetryLadderExhaustedError` — the duty pipeline abstains with kind
// `retry-ladder-exhausted`.
//
// Deliberate policy: a `MalformedVerdictError` short-circuits the ladder.
// Endpoint flakiness is retried; a model that answered but produced garbage
// is not re-asked (nondeterministic re-rolls are how default votes sneak
// in — decision 8). Config (env parsing) lives in the config module
// (accord-jxpn); this module takes explicit endpoint objects.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import { MalformedVerdictError, makeAgentRunner } from "./runner.js";
import type { AgentContext, Verdict, VerdictRunner } from "./runner.js";

/** One openai-compatible endpoint from operator config. */
export interface ProviderEndpoint {
  /** Endpoint label for logs/attempts (e.g. "primary", "fallback"). */
  name: string;
  /** Base URL of the openai-compatible API (e.g. http://host/v1). */
  baseURL: string;
  apiKey: string;
  modelId: string;
}

/** Ladder tuning. All overridable; tests inject a no-op `sleep`. */
export interface LadderOptions {
  /** Total attempts per endpoint before moving on (1 = no in-place retry). */
  retriesPerEndpoint: number;
  initialBackoffMs: number;
  backoffFactor: number;
  /** Backoff sleeper — inject for deterministic tests. */
  sleep(ms: number): Promise<void>;
}

export const DEFAULT_LADDER_OPTIONS: LadderOptions = {
  retriesPerEndpoint: 3,
  initialBackoffMs: 500,
  backoffFactor: 2,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** All endpoints burned. Callers abstain — never vote on a guess. */
export class RetryLadderExhaustedError extends Error {
  constructor(
    public readonly attempts: string[],
    public readonly cause: unknown,
  ) {
    super(`RetryLadderExhausted after ${attempts.length} attempts: ${attempts.join("; ")}`);
    this.name = "RetryLadderExhaustedError";
  }
}

/** Build the chat model for one endpoint. */
export function createProviderModel(endpoint: ProviderEndpoint): LanguageModel {
  const provider = createOpenAICompatible({
    name: endpoint.name,
    baseURL: endpoint.baseURL,
    apiKey: endpoint.apiKey,
    // Send the verdict schema on the wire (response_format: json_schema,
    // strict). Without this the provider downgrades to schema-less
    // json_object mode — the model never sees the verdict shape and every
    // run risks a client-side NoObjectGeneratedError → abstain.
    supportsStructuredOutputs: true,
  });
  return provider.chatModel(endpoint.modelId);
}

/**
 * Run `op` across the model ladder: every model gets
 * `retriesPerEndpoint` attempts with exponential backoff between them.
 * `isFatal` errors rethrow immediately (no further attempts, no wrap).
 */
export async function runOnLadder<T>(
  models: LanguageModel[],
  op: (model: LanguageModel, attempt: number) => Promise<T>,
  options: Partial<LadderOptions> = {},
  isFatal: (err: unknown) => boolean = () => false,
): Promise<T> {
  const opts = { ...DEFAULT_LADDER_OPTIONS, ...options };
  const attempts: string[] = [];
  for (const model of models) {
    let backoff = opts.initialBackoffMs;
    for (let attempt = 1; attempt <= opts.retriesPerEndpoint; attempt += 1) {
      try {
        return await op(model, attempt);
      } catch (err) {
        if (isFatal(err)) {
          throw err;
        }
        attempts.push(
          `${(model as { modelId?: string }).modelId ?? "model"}#${attempt}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        if (attempt < opts.retriesPerEndpoint) {
          await opts.sleep(backoff);
          backoff *= opts.backoffFactor;
        }
      }
    }
  }
  throw new RetryLadderExhaustedError(
    attempts,
    attempts.length > 0 ? new Error(attempts.at(-1)) : undefined,
  );
}

/**
 * Verdict runner over the endpoint ladder: primary first, then the
 * optional fallback, each with in-place backoff retries. Transport/API
 * failures advance the ladder; malformed verdicts short-circuit (a model
 * that answered with garbage is not re-asked).
 */
export function makeLadderVerdictRunner(
  primary: ProviderEndpoint,
  fallback: ProviderEndpoint | undefined,
  options: Partial<LadderOptions> = {},
): VerdictRunner {
  const models = [createProviderModel(primary)];
  if (fallback) {
    models.push(createProviderModel(fallback));
  }
  return {
    async runVerdict(context: AgentContext): Promise<Verdict> {
      return runOnLadder(
        models,
        (model) => makeAgentRunner(model).runVerdict(context),
        options,
        (err) => err instanceof MalformedVerdictError,
      );
    },
  };
}
