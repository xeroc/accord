// provider.test.ts — unit contract for the provider ladder (bean
// accord-ot16): primary → fallback with backoff retries, both from
// createOpenAICompatible endpoints; flaky primary falls through to the
// fallback, exhausted ladder throws, malformed verdicts short-circuit.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/jurat test
import http from "node:http";
import { AddressInfo } from "node:net";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RetryLadderExhaustedError,
  makeLadderVerdictRunner,
  type ProviderEndpoint,
} from "./provider.ts";
import { MalformedVerdictError, type AgentContext, type Verdict } from "./runner.ts";
import { makeJuratTools } from "./tools.ts";

const GOOD_VERDICT: Verdict = {
  optionIndex: 2,
  rationale: "The domain doc puts the burden on the claimant; evidence is unsigned.",
  confidence: 0.71,
};

interface MockServer {
  endpoint: ProviderEndpoint;
  requests: { path: string }[];
  close: () => Promise<void>;
}

/**
 * Mock openai-compatible server: `respond(reqIndex)` decides per-request —
 * `null` for a healthy chat-completion reply, `"fail"` for a 500, or a
 * string used as the structured-output content.
 */
function startMock(
  respond: (reqIndex: number, isOutputCall: boolean) => string | "fail" | null,
): Promise<MockServer> {
  const requests: { path: string }[] = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      const idx = requests.length;
      requests.push({ path: req.url ?? "" });
      let isOutputCall = false;
      try {
        isOutputCall =
          (JSON.parse(data) as { response_format?: unknown }).response_format !== undefined;
      } catch {
        isOutputCall = false;
      }
      const verdict = respond(idx, isOutputCall);
      if (verdict === "fail") {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "upstream exploded" } }));
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: "chatcmpl-mock",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "mock-model",
          choices: [
            {
              index: 0,
              message: isOutputCall
                ? { role: "assistant", content: verdict ?? JSON.stringify(GOOD_VERDICT) }
                : { role: "assistant", content: "", tool_calls: [] },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        endpoint: {
          name: `mock-${port}`,
          baseURL: `http://127.0.0.1:${port}/v1`,
          apiKey: "k",
          modelId: "mock-model",
        },
        requests,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function context(): AgentContext {
  return {
    dispute: "Disp111111111111111111111111111111111111111",
    subaccord: "Suba111111111111111111111111111111111111111",
    numOptions: 3,
    tools: makeJuratTools({
      readDispute: async () => ({}),
      readSubaccord: async () => ({}),
      fetchEvidenceFile: async (_d, name) => ({ name, content: "x" }),
      readDomainDoc: async () => "# doc",
    }),
  };
}

/** Fast ladder: 2 attempts/endpoint, no real sleeping. */
const fastOpts = {
  retriesPerEndpoint: 2,
  initialBackoffMs: 5,
  backoffFactor: 2,
  sleep: async () => {},
};

test("healthy primary answers; fallback never contacted", async () => {
  const primary = await startMock(() => null);
  const fallback = await startMock(() => null);
  try {
    const runner = makeLadderVerdictRunner(primary.endpoint, fallback.endpoint, fastOpts);
    assert.deepEqual(await runner.runVerdict(context()), GOOD_VERDICT);
    assert.ok(primary.requests.length > 0);
    assert.equal(fallback.requests.length, 0);
  } finally {
    await primary.close();
    await fallback.close();
  }
});

test("flaky primary (fails once, then recovers) retries in place via backoff", async () => {
  const sleeps: number[] = [];
  const primary = await startMock((idx) => (idx === 0 ? "fail" : null));
  const fallback = await startMock(() => null);
  try {
    const runner = makeLadderVerdictRunner(primary.endpoint, fallback.endpoint, {
      ...fastOpts,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    assert.deepEqual(await runner.runVerdict(context()), GOOD_VERDICT);
    assert.equal(fallback.requests.length, 0);
    assert.deepEqual(sleeps, [5]); // initialBackoffMs before the in-place retry
  } finally {
    await primary.close();
    await fallback.close();
  }
});

test("dead primary → fallback used", async () => {
  const primary = await startMock(() => "fail");
  const fallback = await startMock(() => null);
  try {
    const runner = makeLadderVerdictRunner(primary.endpoint, fallback.endpoint, fastOpts);
    assert.deepEqual(await runner.runVerdict(context()), GOOD_VERDICT);
    assert.equal(primary.requests.length, fastOpts.retriesPerEndpoint);
    assert.ok(fallback.requests.length > 0);
  } finally {
    await primary.close();
    await fallback.close();
  }
});

test("both endpoints dead → RetryLadderExhaustedError, all attempts burned", async () => {
  const primary = await startMock(() => "fail");
  const fallback = await startMock(() => "fail");
  try {
    const runner = makeLadderVerdictRunner(primary.endpoint, fallback.endpoint, fastOpts);
    await assert.rejects(
      () => runner.runVerdict(context()),
      (err: unknown) =>
        err instanceof RetryLadderExhaustedError &&
        err.attempts.length === 2 * fastOpts.retriesPerEndpoint,
    );
    assert.equal(primary.requests.length, fastOpts.retriesPerEndpoint);
    assert.equal(fallback.requests.length, fastOpts.retriesPerEndpoint);
  } finally {
    await primary.close();
    await fallback.close();
  }
});

test("no fallback configured: single dead endpoint → exhausted error", async () => {
  const primary = await startMock(() => "fail");
  try {
    const runner = makeLadderVerdictRunner(primary.endpoint, undefined, fastOpts);
    await assert.rejects(() => runner.runVerdict(context()), RetryLadderExhaustedError);
    assert.equal(primary.requests.length, fastOpts.retriesPerEndpoint);
  } finally {
    await primary.close();
  }
});

test("malformed verdict short-circuits the ladder — no fallback burn", async () => {
  // primary's structured-output call answers prose → MalformedVerdictError
  const primary = await startMock((_idx, isOutputCall) =>
    isOutputCall ? "option 1 looks right" : null,
  );
  const fallback = await startMock(() => null);
  try {
    const runner = makeLadderVerdictRunner(primary.endpoint, fallback.endpoint, fastOpts);
    await assert.rejects(() => runner.runVerdict(context()), MalformedVerdictError);
    assert.equal(fallback.requests.length, 0, "malformed output must not retry or fall over");
  } finally {
    await primary.close();
    await fallback.close();
  }
});
