// provider.test.ts — unit contract for the provider ladder (bean
// accord-ot16): primary → fallback with backoff retries, both from
// createOpenAICompatible endpoints; flaky primary falls through to the
// fallback, exhausted ladder throws, malformed verdicts short-circuit.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/jurat test
import http from "node:http";
import { AddressInfo } from "node:net";
import { Output, generateText } from "ai";
import assert from "node:assert/strict";
import {
  RetryLadderExhaustedError,
  createProviderModel,
  makeLadderVerdictRunner,
  type ProviderEndpoint,
} from "./provider.ts";
import { MalformedVerdictError, verdictSchema, type AgentContext, type Verdict } from "./runner.ts";
import { makeJuratTools } from "./tools.ts";

const GOOD_VERDICT: Verdict = {
  optionIndex: 2,
  rationale: "The domain doc puts the burden on the claimant; evidence is unsigned.",
  confidence: 0.71,
};

interface MockServer {
  endpoint: ProviderEndpoint;
  requests: { path: string; body: unknown }[];
  close: () => Promise<void>;
}

/**
 * Mock openai-compatible server: `respond(reqIndex, body)` decides per
 * request — `null` for a healthy verdict reply, `{toolCall}` to answer the
 * runner's forced step-0 tool_choice:"required" with a function call,
 * `"fail"` for a 500, or a string as the structured-output content.
 */
function startMock(
  respond: (
    reqIndex: number,
    body: Record<string, unknown>,
  ) => string | "fail" | null | { toolCall: { name: string; arguments: string } },
): Promise<MockServer> {
  const requests: { path: string; body: unknown }[] = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = null;
      }
      requests.push({ path: req.url ?? "", body: parsed });
      const idx = requests.length - 1;
      const reply = respond(idx, (parsed ?? {}) as Record<string, unknown>);
      const toolCall =
        (parsed as Record<string, unknown> | null)?.tool_choice === "required" &&
        reply !== null &&
        typeof reply === "object"
          ? reply.toolCall
          : null;
      if (reply === "fail") {
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
              message: toolCall
                ? {
                    role: "assistant",
                    content: "",
                    tool_calls: [
                      {
                        index: 0,
                        id: "call-1",
                        type: "function",
                        function: { name: toolCall.name, arguments: toolCall.arguments },
                      },
                    ],
                  }
                : { role: "assistant", content: reply ?? JSON.stringify(GOOD_VERDICT) },
              finish_reason: toolCall ? "tool_calls" : "stop",
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
/** Reply shape for the runner's forced step-0 investigation call. */
const investigateReply = {
  toolCall: {
    name: "read_dispute",
    arguments: JSON.stringify({ dispute: "Disp111111111111111111111111111111111111111" }),
  },
};
/** Healthy model: investigate when forced, verdict content afterwards. */
const healthy = (
  _idx: number,
  body: Record<string, unknown>,
): string | null | typeof investigateReply =>
  body.tool_choice === "required" ? investigateReply : null;

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
      readCase: async () => null,
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

test("verdict calls carry the schema on the wire — json_schema, not json_object", async () => {
  const mock = await startMock(() => null);
  try {
    const { output } = await generateText({
      model: createProviderModel(mock.endpoint),
      prompt: "judge",
      maxRetries: 0,
      output: Output.object({ schema: verdictSchema }),
    });
    assert.deepEqual(output, GOOD_VERDICT);
    const last = mock.requests.at(-1)?.body;
    assert.ok(typeof last === "object" && last !== null && "response_format" in last);
    const rf = last.response_format;
    assert.ok(typeof rf === "object" && rf !== null && "type" in rf);
    assert.equal(rf.type, "json_schema");
  } finally {
    await mock.close();
  }
});

test("healthy primary answers; fallback never contacted", async () => {
  const primary = await startMock(healthy);
  const fallback = await startMock(healthy);
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
  const primary = await startMock((idx, body) => (idx === 0 ? "fail" : healthy(idx, body)));
  const fallback = await startMock(healthy);
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
  const fallback = await startMock(healthy);
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
  const primary = await startMock((_idx, body) =>
    body.tool_choice === "required" ? investigateReply : "option 1 looks right",
  );
  const fallback = await startMock(healthy);
  try {
    const runner = makeLadderVerdictRunner(primary.endpoint, fallback.endpoint, fastOpts);
    await assert.rejects(() => runner.runVerdict(context()), MalformedVerdictError);
    assert.equal(fallback.requests.length, 0, "malformed output must not retry or fall over");
  } finally {
    await primary.close();
    await fallback.close();
  }
});
