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
import { tool } from "ai";
import { z } from "zod";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { BUILTIN_TOOL_NAMES, makeJuratTools } from "./tools.ts";
import { startMockLlm } from "./testing/mock-llm.ts";
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
    if (body.response_format) return JSON.stringify({ ...GOOD_VERDICT, optionIndex: 5 }); // numOptions: 3
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

// ─── trace tap (bean accord-1nxb, ADR-0037) ────────────────────────────────
//
// The mock-llm rig drives N model steps; the tap must emit one agent-start
// before the call and one step event per step, in order. Builtin-four tool
// args pass through verbatim, every other tool's args are digest-only, and
// tool results are ALWAYS digest-only — no evidence content, no model text.

const TRACE_DEPS = {
  readDispute: async () => ({ zFirst: 1, aSecond: 2, state: "Voting", filer: "F" }),
  readSubaccord: async () => ({}),
  fetchEvidenceFile: async (_d: string, name: string) => ({
    name,
    content: "SECRET-EVIDENCE-TEXT",
  }),
  readDomainDoc: async () => "# doc",
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
    assert.deepEqual(rd.args, { dispute: DISPUTE }); // builtin four → raw args
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

test("trace tap: non-builtin (MCP) tool args are digest-only", async () => {
  const server = startMockLlm([
    {
      kind: "toolCalls",
      toolCalls: [
        { id: "call-9", name: "mcp_lookup", arguments: JSON.stringify({ q: "secret-mcp-query" }) },
      ],
    },
    { kind: "text", text: JSON.stringify(GOOD_VERDICT) },
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
