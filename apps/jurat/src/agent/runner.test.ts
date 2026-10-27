// runner.test.ts — unit contract for the verdict runner (bean accord-o2dc):
// runVerdict(AgentContext) → Verdict structured output over the read-only
// toolset, driven against a mock openai-compatible HTTP server; malformed,
// out-of-bounds, and uninvestigated verdicts are rejected, never guessed
// around. Step 0 forces tool use (toolChoice:"required") — a model that
// answers the verdict without calling a tool never becomes a vote.
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
import { startMockLlm } from "./testing/mock-llm.ts";

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
  tool_choice?: unknown;
}
/** Reply while the runner forces step-0 tool use: one function call. */
interface MockToolCallReply {
  toolCall: { name: string; arguments: string };
}

/**
 * Mock openai-compatible /chat/completions endpoint. `respond` decides the
 * assistant reply per request. The runner's forced investigation step is
 * visible on the wire as tool_choice:"required" — such requests must be
 * answered with a tool call (a content answer is a ToolChoiceViolation).
 */
function startMockServer(respond: (body: ChatRequestBody) => string | null | MockToolCallReply) {
  const requests: ChatRequestBody[] = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      requests.push(JSON.parse(data) as ChatRequestBody);
      const body = JSON.parse(data) as ChatRequestBody;
      const reply = respond(body);
      const required = body.tool_choice === "required";
      const toolCall =
        required && typeof reply === "object" && reply !== null && "toolCall" in reply
          ? reply.toolCall
          : null;
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
                : { role: "assistant", content: reply as string | null },
              finish_reason: toolCall ? "tool_calls" : "stop",
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
  const provider = createOpenAICompatible({
    name: "mock",
    baseURL: url,
    supportsStructuredOutputs: true,
  });
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
      readCase: async () => null,
    }),
    ...overrides,
  };
}

/** Responder rig: read_dispute tool call on the forced step 0, `verdict` content afterwards. */
function investigated(
  verdict: string,
): (body: ChatRequestBody) => string | null | MockToolCallReply {
  return (body) =>
    body.tool_choice === "required"
      ? { toolCall: { name: "read_dispute", arguments: JSON.stringify({ dispute: DISPUTE }) } }
      : verdict;
}

test("happy path: structured verdict after forced step-0 tool call", async () => {
  const server = await startMockServer(investigated(JSON.stringify(GOOD_VERDICT)));
  try {
    const runner = makeRunner(server.url);
    const verdict = await runner.runVerdict(context());
    assert.deepEqual(verdict, GOOD_VERDICT);
    // step 0 forces investigation; later steps choose freely
    assert.equal(server.requests[0]?.tool_choice, "required");
    assert.equal(
      server.requests.filter((r) => r.tool_choice === "required").length,
      1,
      "only the first step forces tool use",
    );
    assert.notEqual(server.requests.at(-1)?.tool_choice, "required");
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

test("debug trace: prompts, ⚒ tool calls + results, and response logged at debug", async () => {
  const lines: string[] = [];
  const llm = await startMockLlm([
    {
      kind: "toolCalls",
      toolCalls: [{ id: "call-1", name: "read_dispute", arguments: `{"dispute":"${DISPUTE}"}` }],
    },
    { kind: "text", text: "investigation summary" },
    { kind: "text", text: JSON.stringify(GOOD_VERDICT) },
  ]);
  try {
    const provider = createOpenAICompatible({
      name: "mock",
      baseURL: llm.url,
      supportsStructuredOutputs: true,
    });
    const runner = makeAgentRunner(provider.chatModel("mock-model"), undefined, {
      debug: (message) => lines.push(message),
    });
    const verdict = await runner.runVerdict(context());
    assert.deepEqual(verdict, GOOD_VERDICT);
    assert.ok(
      lines.some((l) => l.startsWith("system prompt:")),
      "system prompt logged",
    );
    assert.ok(
      lines.some((l) => l.startsWith("user prompt:") && l.includes(DISPUTE)),
      "user prompt with dispute logged",
    );
    assert.ok(
      lines.some((l) => l.includes("⚒ read_dispute(")),
      "tool call logged",
    );
    assert.ok(
      lines.some((l) => l.includes("⚒ read_dispute →")),
      "tool result logged",
    );
    assert.ok(
      lines.some((l) => l.startsWith("response:")),
      "response logged",
    );
  } finally {
    await llm.stop();
  }
});

test("harness prompt: investigation protocol with grounded addresses reaches the model", async () => {
  const llm = await startMockLlm([
    {
      kind: "toolCalls",
      toolCalls: [{ id: "call-1", name: "read_dispute", arguments: `{"dispute":"${DISPUTE}"}` }],
    },
    { kind: "text", text: "investigation summary" },
    { kind: "text", text: JSON.stringify(GOOD_VERDICT) },
  ]);
  try {
    const provider = createOpenAICompatible({
      name: "mock",
      baseURL: llm.url,
      supportsStructuredOutputs: true,
    });
    const runner = makeAgentRunner(provider.chatModel("mock-model"));
    await runner.runVerdict(context());

    const body = llm.requests[0]?.body as { messages: ChatMessage[] };
    const system = String(body.messages.find((m) => m.role === "system")?.content);
    const user = String(body.messages.find((m) => m.role === "user")?.content);

    for (const fragment of [
      "read_domain_doc",
      "read_dispute",
      "fetch_evidence_file",
      "read_case",
      "untrusted",
      "Schelling point",
    ]) {
      assert.ok(system.includes(fragment), `system prompt missing: ${fragment}`);
    }
    assert.ok(
      user.includes(`read_domain_doc({"subaccord": "${SUBACCORD}"})`),
      "user prompt must prescribe read_domain_doc with the subaccord PDA",
    );
    assert.ok(
      user.includes(`read_dispute({"dispute": "${DISPUTE}"})`),
      "user prompt must prescribe read_dispute with the dispute PDA",
    );
    assert.ok(
      user.includes(`read_case({"dispute": "${DISPUTE}"})`),
      "user prompt must prescribe read_case with the dispute PDA",
    );
    assert.ok(
      user.includes("fetch_evidence_file") && user.includes(DISPUTE),
      "user prompt must prescribe fetching every evidence file",
    );
    assert.ok(
      user.toLowerCase().includes("do not answer from priors"),
      "user prompt must forbid prior-only verdicts",
    );
  } finally {
    await llm.stop();
  }
});

test("malformed model output (not JSON) → MalformedVerdictError", async () => {
  const server = await startMockServer(
    (body) =>
      body.tool_choice === "required"
        ? { toolCall: { name: "read_dispute", arguments: JSON.stringify({ dispute: DISPUTE }) } }
        : "I think option 1 is right", // prose, no JSON
  );
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
  const server = await startMockServer(
    investigated(JSON.stringify({ optionIndex: 0, rationale: "", confidence: 7 })),
  );
  try {
    const runner = makeRunner(server.url);
    await assert.rejects(() => runner.runVerdict(context()), MalformedVerdictError);
  } finally {
    await server.close();
  }
});

test("out-of-bounds optionIndex (valid schema, wrong dispute) → rejected", async () => {
  const server = await startMockServer(
    investigated(JSON.stringify({ ...GOOD_VERDICT, optionIndex: 5 })),
  ); // numOptions: 3
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

test("model answering the verdict without any tool call → rejected, not voted", async () => {
  // Provider ignores tool_choice:"required" and answers content directly —
  // the SDK raises a ToolChoiceViolation; the runner must map it to a
  // malformed verdict (clean abstain), never ride the retry ladder.
  const server = await startMockServer(() => JSON.stringify(GOOD_VERDICT));
  try {
    const runner = makeRunner(server.url);
    await assert.rejects(
      () => runner.runVerdict(context()),
      (err: unknown) =>
        err instanceof MalformedVerdictError && /without investigating/.test(err.message),
    );
    assert.equal(server.requests.length, 1, "violation must not be re-asked");
  } finally {
    await server.close();
  }
});

test("verdictSchema pins the wire shape: optionIndex/rationale/confidence", () => {
  assert.equal(verdictSchema.safeParse(GOOD_VERDICT).success, true);
  assert.equal(verdictSchema.safeParse({ ...GOOD_VERDICT, optionIndex: 1.5 }).success, false);
  assert.equal(verdictSchema.safeParse({ ...GOOD_VERDICT, optionIndex: -1 }).success, false);
  assert.equal(
    verdictSchema.safeParse({ optionIndex: 0, rationale: "x", confidence: 1.5 }).success,
    false,
  );
});
