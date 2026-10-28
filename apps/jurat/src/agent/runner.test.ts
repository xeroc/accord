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
import { tool } from "ai";
import { z } from "zod";
import { ed25519 } from "@noble/curves/ed25519";
import { verifyTraceBatchSig } from "@useaccord/sdk/evidence";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { signTraceBatch } from "../trace/sink.ts";
import { startMockLlm } from "./testing/mock-llm.ts";
import { BUILTIN_TOOL_NAMES, makeJuratTools } from "./tools.ts";
import {
  MalformedVerdictError,
  makeAgentRunner,
  verdictSchema,
  type RunnerTraceEvent,
  type StepEvent,
  type Verdict,
} from "./runner.ts";

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

// ─── trace tap (bean accord-1nxb, ADR-0037) ────────────────────────────────
//
// The mock-llm rig drives N model steps; the tap must emit one agent-start
// before the call and one step event per step, in order. Builtin-four tool
// args pass through verbatim, every other tool's args are digest-only, and
// tool results are ALWAYS digest-only — no evidence content, no model text.
// The final script turn answers the two-phase runner's phase-2 extraction
// re-ask (no tools, structured output) — it emits no step event.

const TRACE_DEPS = {
  readDispute: async () => ({ zFirst: 1, aSecond: 2, state: "Voting", filer: "F" }),
  readSubaccord: async () => ({}),
  fetchEvidenceFile: async (_d: string, name: string) => ({
    name,
    content: "SECRET-EVIDENCE-TEXT",
  }),
  readDomainDoc: async () => "# doc",
  readCase: async () => null,
};

// sha256 over canonical JSON (sorted keys, no whitespace) — pinned oracles.
const READ_DISPUTE_DIGEST = "3b9dd9867ae2b979827bba0d6b5c9356cf0cb09ad81806aba29b061861063152";
const FETCH_EVIDENCE_DIGEST = "9c59d7297b831a4756797240e1db7eb8e3e74f5528d16a23ba67597d35068147";
const MCP_ARGS_DIGEST = "b5cbde9d464709d16f26479db127a7619851327172dff0f0f5e10aeb48a193f1";
const MCP_RESULT_DIGEST = "d191467341a0427ed5bb9d604cf7c9a558a1ccc94d56424158dd51fc60f2feff";

function isStep(event: RunnerTraceEvent): event is StepEvent {
  return event.kind === "step";
}

test("trace tap: agent-start then one step event per model step, in order", async () => {
  const server = startMockLlm([
    {
      kind: "toolCalls",
      toolCalls: [
        { id: "call-1", name: "read_dispute", arguments: JSON.stringify({ dispute: DISPUTE }) },
      ],
    },
    {
      kind: "toolCalls",
      toolCalls: [
        {
          id: "call-2",
          name: "fetch_evidence_file",
          arguments: JSON.stringify({ dispute: DISPUTE, file: "a.txt" }),
        },
      ],
    },
    { kind: "text", text: JSON.stringify(GOOD_VERDICT) },
    { kind: "text", text: JSON.stringify(GOOD_VERDICT) },
  ]);
  const events: RunnerTraceEvent[] = [];
  try {
    const provider = createOpenAICompatible({ name: "mock", baseURL: server.url });
    const runner = makeAgentRunner(provider.chatModel("mock-model"));
    const verdict = await runner.runVerdict(
      context({
        tools: makeJuratTools(TRACE_DEPS),
        maxSteps: 5,
        trace: (event: RunnerTraceEvent) => events.push(event),
      }),
    );
    assert.deepEqual(verdict, GOOD_VERDICT); // the tap never disturbs the verdict

    assert.equal(events.length, 4);
    assert.deepEqual(events[0], { kind: "agent-start", model: "mock-model", maxSteps: 5 });

    const steps = events.filter(isStep);
    assert.deepEqual(
      steps.map((s) => s.n),
      [1, 2, 3],
    ); // N steps → N events, in order

    const rd = steps[0].toolCalls[0];
    assert.equal(rd.name, "read_dispute");
    assert.deepEqual(rd.args, { dispute: DISPUTE }); // builtin → raw args
    assert.equal(rd.resultDigest, READ_DISPUTE_DIGEST);
    assert.equal(rd.bytes, 53);
    assert.equal(typeof rd.ms, "number");

    const fe = steps[1].toolCalls[0];
    assert.equal(fe.name, "fetch_evidence_file");
    assert.deepEqual(fe.args, { dispute: DISPUTE, file: "a.txt" });
    assert.equal(fe.resultDigest, FETCH_EVIDENCE_DIGEST);
    assert.equal(fe.bytes, 49);

    assert.deepEqual(steps[2].toolCalls, []); // text-only final step
    for (const s of steps) assert.equal(typeof s.usage, "object");

    // ADR-0037 redaction: no evidence content, no verdict rationale/model text.
    const json = JSON.stringify(events);
    assert.ok(!json.includes("SECRET-EVIDENCE-TEXT"));
    assert.ok(!json.includes(GOOD_VERDICT.rationale));
  } finally {
    await server.stop();
  }
});

test("trace tap: step events sign+verify across the JSON wire round-trip (ai@7 usage shape)", async () => {
  // accord-r64v: stepEvent passes LanguageModelUsage through raw; ai@7
  // materializes optional fields as explicit `undefined`. The sink signs the
  // in-memory object, the daemon re-canonicalizes the parsed wire body — any
  // canonical divergence 403s the push and the batch is dropped (observed:
  // every step event of every real run). Real provider normalization in the
  // loop, so the regression cannot rot into a hand-built lookalike.
  const server = startMockLlm([
    {
      kind: "toolCalls",
      toolCalls: [
        { id: "call-1", name: "read_dispute", arguments: JSON.stringify({ dispute: DISPUTE }) },
      ],
    },
    { kind: "text", text: JSON.stringify(GOOD_VERDICT) },
    { kind: "text", text: JSON.stringify(GOOD_VERDICT) }, // phase-2 re-ask
  ]);
  const events: RunnerTraceEvent[] = [];
  try {
    const provider = createOpenAICompatible({ name: "mock", baseURL: server.url });
    const runner = makeAgentRunner(provider.chatModel("mock-model"));
    await runner.runVerdict(
      context({
        maxSteps: 5,
        trace: (event: RunnerTraceEvent) => events.push(event),
      }),
    );
    const steps = events.filter(isStep);
    assert.ok(steps.length >= 1);
    const seed = new Uint8Array(32).fill(3);
    const ident = { juror: "Juror111111111111111111111111111111111111111", dispute: DISPUTE };
    const sig = signTraceBatch({ v: 1, seq: 1, events: steps }, ident, seed);
    const wireEvents: unknown[] = JSON.parse(JSON.stringify(steps));
    assert.equal(
      verifyTraceBatchSig(
        ed25519.getPublicKey(seed),
        { v: 1, juror: ident.juror, dispute: ident.dispute, seq: 1, events: wireEvents },
        Buffer.from(sig, "base64"),
      ),
      true,
    );
  } finally {
    await server.stop();
  }
});

test("trace tap: non-builtin (MCP) tool args are digest-only", async () => {
  const server = startMockLlm([
    {
      kind: "toolCalls",
      toolCalls: [
        { id: "call-9", name: "mcp_lookup", arguments: JSON.stringify({ q: "secret-mcp-query" }) },
      ],
    },
    { kind: "text", text: JSON.stringify(GOOD_VERDICT) },
    { kind: "text", text: JSON.stringify(GOOD_VERDICT) }, // phase-2 re-ask
  ]);
  const events: RunnerTraceEvent[] = [];
  const tools = {
    ...makeJuratTools(TRACE_DEPS),
    mcp_lookup: tool({
      description: "stand-in for an operator-configured MCP tool",
      inputSchema: z.object({ q: z.string() }),
      execute: async ({ q }) => ({ hit: q }),
    }),
  };
  try {
    const provider = createOpenAICompatible({ name: "mock", baseURL: server.url });
    await makeAgentRunner(provider.chatModel("mock-model")).runVerdict(
      context({ tools, trace: (event: RunnerTraceEvent) => events.push(event) }),
    );
    const tc = events.filter(isStep)[0].toolCalls[0];
    assert.equal(tc.name, "mcp_lookup");
    assert.ok(!("args" in tc), "MCP tool args must never appear in a trace");
    assert.equal(tc.argsDigest, MCP_ARGS_DIGEST);
    assert.equal(tc.resultDigest, MCP_RESULT_DIGEST);
    assert.ok(!JSON.stringify(events).includes("secret-mcp-query"));
  } finally {
    await server.stop();
  }
});

test("trace tap: digests are stable across runs", async () => {
  const runOnce = async (): Promise<string> => {
    const server = startMockLlm([
      {
        kind: "toolCalls",
        toolCalls: [
          { id: "c", name: "read_dispute", arguments: JSON.stringify({ dispute: DISPUTE }) },
        ],
      },
      { kind: "text", text: JSON.stringify(GOOD_VERDICT) },
      { kind: "text", text: JSON.stringify(GOOD_VERDICT) }, // phase-2 re-ask
    ]);
    const events: RunnerTraceEvent[] = [];
    try {
      const provider = createOpenAICompatible({ name: "mock", baseURL: server.url });
      await makeAgentRunner(provider.chatModel("mock-model")).runVerdict(
        context({ tools: makeJuratTools(TRACE_DEPS), trace: (event) => events.push(event) }),
      );
      return events.filter(isStep)[0].toolCalls[0].resultDigest;
    } finally {
      await server.stop();
    }
  };
  assert.equal(await runOnce(), READ_DISPUTE_DIGEST);
  assert.equal(await runOnce(), READ_DISPUTE_DIGEST);
});

test("trace tap: BUILTIN_TOOL_NAMES pins the closed builtin set (redaction gate)", () => {
  assert.deepEqual(
    Object.keys(BUILTIN_TOOL_NAMES).sort(),
    Object.keys(makeJuratTools(TRACE_DEPS)).sort(),
  );
});
