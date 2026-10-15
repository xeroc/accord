// runner.test.ts — unit contract for the verdict runner (bean accord-o2dc):
// runVerdict(AgentContext) → Verdict structured output over the read-only
// toolset, driven against a mock openai-compatible HTTP server; malformed
// and out-of-bounds verdicts are rejected, never guessed around.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/jurat test
import http from "node:http";
import { AddressInfo } from "node:net";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { makeJuratTools } from "./tools.ts";
import { MalformedVerdictError, makeAgentRunner, verdictSchema, type Verdict } from "./runner.ts";

const DISPUTE = "Disp111111111111111111111111111111111111111";
const SUBACCORD = "Suba111111111111111111111111111111111111111";

const GOOD_VERDICT: Verdict = {
  optionIndex: 1,
  rationale: "Claimant's evidence is signed by the escrow; respondent offers nothing.",
  confidence: 0.82,
};

type ChatMessage = { role: string; content: unknown };
interface ChatRequestBody {
  messages: ChatMessage[];
  response_format?: { type?: string; json_schema?: unknown };
}

/**
 * Mock openai-compatible /chat/completions endpoint. `respond` decides the
 * assistant content per request: the structured-output phase is detected
 * via `response_format`; the tool phase answers with an empty stop so the
 * loop falls through to the output call.
 */
function startMockServer(respond: (body: ChatRequestBody) => string | null) {
  const requests: ChatRequestBody[] = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      requests.push(JSON.parse(data) as ChatRequestBody);
      const body = JSON.parse(data) as ChatRequestBody;
      const content = respond(body);
      const isOutputCall = body.response_format !== undefined;
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
                ? { role: "assistant", content }
                : { role: "assistant", content: "", tool_calls: [] },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );
    });
  });
  return new Promise<{ url: string; requests: ChatRequestBody[]; close: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve({
          url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
          requests,
          close: () => new Promise<void>((done) => server.close(() => done())),
        });
      });
    },
  );
}

function makeRunner(url: string) {
  const provider = createOpenAICompatible({ name: "mock", baseURL: url });
  return makeAgentRunner(provider.chatModel("mock-model"));
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    dispute: DISPUTE,
    subaccord: SUBACCORD,
    numOptions: 3,
    tools: makeJuratTools({
      readDispute: async () => ({}),
      readSubaccord: async () => ({}),
      fetchEvidenceFile: async (_d, name) => ({ name, content: "x" }),
      readDomainDoc: async () => "# doc",
    }),
    ...overrides,
  };
}

test("happy path: structured verdict parsed from the mock server", async () => {
  const server = await startMockServer((body) => {
    if (body.response_format) return JSON.stringify(GOOD_VERDICT);
    return null;
  });
  try {
    const runner = makeRunner(server.url);
    const verdict = await runner.runVerdict(context());
    assert.deepEqual(verdict, GOOD_VERDICT);
    // the dispute under judgment is in the prompt
    const last = server.requests.at(-1);
    assert.ok(
      JSON.stringify(last).includes(DISPUTE),
      "dispute address must reach the model prompt",
    );
  } finally {
    await server.close();
  }
});

test("malformed model output (not JSON) → MalformedVerdictError", async () => {
  const server = await startMockServer((body) => {
    if (body.response_format) return "I think option 1 is right"; // prose, no JSON
    return null;
  });
  try {
    const runner = makeRunner(server.url);
    await assert.rejects(
      () => runner.runVerdict(context()),
      (err: unknown) => err instanceof MalformedVerdictError,
    );
  } finally {
    await server.close();
  }
});

test("schema-invalid verdict (missing rationale, confidence out of range) → rejected", async () => {
  const server = await startMockServer((body) => {
    if (body.response_format)
      return JSON.stringify({ optionIndex: 0, rationale: "", confidence: 7 });
    return null;
  });
  try {
    const runner = makeRunner(server.url);
    await assert.rejects(() => runner.runVerdict(context()), MalformedVerdictError);
  } finally {
    await server.close();
  }
});

test("out-of-bounds optionIndex (valid schema, wrong dispute) → rejected", async () => {
  const server = await startMockServer((body) => {
    if (body.response_format)
      return JSON.stringify({ ...GOOD_VERDICT, optionIndex: 5 }); // numOptions: 3
    return null;
  });
  try {
    const runner = makeRunner(server.url);
    await assert.rejects(
      () => runner.runVerdict(context()),
      (err: unknown) => err instanceof MalformedVerdictError && /optionIndex/.test(err.message),
    );
  } finally {
    await server.close();
  }
});

test("verdictSchema pins the wire shape: optionIndex/rationale/confidence", () => {
  assert.equal(verdictSchema.safeParse(GOOD_VERDICT).success, true);
  assert.equal(verdictSchema.safeParse({ ...GOOD_VERDICT, optionIndex: 1.5 }).success, false);
  assert.equal(verdictSchema.safeParse({ ...GOOD_VERDICT, optionIndex: -1 }).success, false);
  assert.equal(verdictSchema.safeParse({ optionIndex: 0, confidence: 0.5 }).success, false);
});
