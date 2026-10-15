/**
 * Mock LLM server test rig (bean accord-f3ir). Proves the rig against the
 * REAL `@ai-sdk/openai-compatible` client (the stack ADR-0036 locks in):
 * canned text, tool-call turns (verdict shape), text-instead-of-tool
 * (refusal shape), malformed bodies, HTTP errors, hangs, and determinism.
 * Agent tests build on this rig and stay fully deterministic.
 */
import { afterAll, describe, expect, it } from "bun:test";
import { generateText, stepCountIs, streamText, tool } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { startMockLlm, type MockLlmServer, type MockTurn } from "./mock-llm.js";

const servers: MockLlmServer[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => s.stop()));
});

/** Start + register for teardown, wrapped in the real provider. */
function rig(turns: MockTurn[]) {
  const server = startMockLlm(turns);
  servers.push(server);
  const provider = createOpenAICompatible({
    name: "mock",
    baseURL: `${server.url}/v1`,
    apiKey: "test-key",
  });
  return { server, model: provider("mock-model") };
}

const VERDICT_ARGS = {
  option: 1,
  rationale: "Evidence hash matches.",
  confidence: 0.8,
};

const verdictTool = tool({
  description: "Submit the final verdict",
  inputSchema: z.object({
    option: z.number(),
    rationale: z.string(),
    confidence: z.number(),
  }),
  execute: async () => "recorded",
});

describe("mock LLM server — happy paths", () => {
  it("generateText (non-streaming POST) returns the canned text", async () => {
    const { server, model } = rig([{ kind: "text", text: "deliberating…" }]);
    const { text } = await generateText({ model, prompt: "Judge dispute X" });
    expect(text).toBe("deliberating…");
    // Captured request: what the agent sent — assertable in agent tests.
    expect(server.requests.length).toBe(1);
    const req = server.requests[0]!;
    expect(req.path).toBe("/v1/chat/completions");
    expect(req.auth).toBe("Bearer test-key");
    if (typeof req.body !== "object") throw new Error("expected object body");
    expect(req.body.model).toBe("mock-model");
    expect(req.body.stream).not.toBe(true);
  });

  it("streamText (SSE POST) returns the canned text", async () => {
    const { model } = rig([{ kind: "text", text: "streamed verdict" }]);
    const { textStream } = streamText({ model, prompt: "Judge dispute Y" });
    let out = "";
    for await (const chunk of textStream) out += chunk;
    expect(out).toBe("streamed verdict");
  });

  it("tool-call turn drives the agent loop; args arrive parsed", async () => {
    const { model } = rig([
      {
        kind: "toolCalls",
        toolCalls: [
          {
            id: "call-1",
            name: "submit_verdict",
            arguments: JSON.stringify(VERDICT_ARGS),
          },
        ],
      },
      { kind: "text", text: "done" },
    ]);
    const result = await generateText({
      model,
      prompt: "Judge dispute Z",
      tools: { submit_verdict: verdictTool },
      stopWhen: stepCountIs(4),
    });
    expect(result.toolCalls.length).toBe(1);
    expect(result.toolCalls[0]!.toolName).toBe("submit_verdict");
    expect(result.toolCalls[0]!.input).toEqual(VERDICT_ARGS);
    expect(result.steps.length).toBe(2);
  });

  it("refusal shape — text instead of a tool call — surfaces as plain text", async () => {
    const { model } = rig([
      { kind: "text", text: "I cannot rule on this dispute." },
    ]);
    const result = await generateText({
      model,
      prompt: "Judge dispute W",
      tools: { submit_verdict: verdictTool },
      stopWhen: stepCountIs(2),
    });
    expect(result.toolCalls.length).toBe(0);
    expect(result.text).toContain("cannot rule");
  });
});

describe("mock LLM server — failure paths", () => {
  // maxRetries: 0 — the SDK's own retry backoff would otherwise consume
  // scripted turns and blow the 5s test budget. Retry-ladder behavior is the
  // agent runner's concern; the rig serves each failure exactly once.
  it("malformed 200 body rejects the client", async () => {
    const { model } = rig([{ kind: "malformed", body: "<<not-json>>" }]);
    await expect(
      generateText({ model, prompt: "x", maxRetries: 0 }),
    ).rejects.toThrow();
  });

  it("HTTP error (429) rejects the client", async () => {
    const { model } = rig([
      { kind: "httpError", status: 429, body: "rate limited" },
    ]);
    await expect(
      generateText({ model, prompt: "x", maxRetries: 0 }),
    ).rejects.toThrow();
  });

  it("hanging turn hits the client abort signal, not the test timeout", async () => {
    const { model } = rig([{ kind: "hang", ms: 5_000 }]);
    await expect(
      generateText({
        model,
        prompt: "x",
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(100),
      }),
    ).rejects.toThrow();
  });

  it("exhausted script is a loud 500, not a silent repeat", async () => {
    const { server, model } = rig([{ kind: "text", text: "only turn" }]);
    await generateText({ model, prompt: "x", maxRetries: 0 });
    await expect(
      generateText({ model, prompt: "y", maxRetries: 0 }),
    ).rejects.toThrow(/script exhausted/);
    expect(server.requests.length).toBe(2);
  });
});

describe("mock LLM server — determinism", () => {
  it("same script → byte-identical requests and identical outputs", async () => {
    const script: MockTurn[] = [
      {
        kind: "toolCalls",
        toolCalls: [
          {
            id: "call-1",
            name: "submit_verdict",
            arguments: JSON.stringify(VERDICT_ARGS),
          },
        ],
      },
      { kind: "text", text: "done" },
    ];
    const a = rig(script);
    const b = rig(script);
    const ra = await generateText({
      model: a.model,
      prompt: "Judge dispute D",
      tools: { submit_verdict: verdictTool },
      stopWhen: stepCountIs(4),
    });
    const rb = await generateText({
      model: b.model,
      prompt: "Judge dispute D",
      tools: { submit_verdict: verdictTool },
      stopWhen: stepCountIs(4),
    });
    expect(ra.text).toBe(rb.text);
    expect(ra.toolCalls).toEqual(rb.toolCalls);
    expect(a.server.requests).toEqual(b.server.requests);
  });
});
