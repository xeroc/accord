/**
 * Mock openai-compatible LLM server (bean accord-f3ir) — the deterministic
 * test rig for the agent runner (ADR-0036 stack: `ai` +
 * `@ai-sdk/openai-compatible`). Serves a fixed script of turns in order at
 * `/chat/completions` (streaming SSE and non-streaming JSON, honoring the
 * request's `stream` flag) and captures every request so agent tests can
 * assert exactly what the agent sent. No randomness: ids are sequential,
 * timestamps fixed — the same script always produces byte-identical traffic.
 *
 * Failure turns cover the retry ladder's inputs: malformed 200 bodies, HTTP
 * errors (auth/rate-limit/provider death), and hangs (client abort path).
 * A text turn where a tool call was expected is the "refusal" shape.
 */

/** One assistant tool call, wire format: `arguments` is a JSON string. */
export interface MockToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

export type MockTurn =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "toolCalls"; readonly toolCalls: readonly MockToolCall[] }
  | { readonly kind: "malformed"; readonly body: string }
  | {
      readonly kind: "httpError";
      readonly status: number;
      readonly body?: string;
    }
  /** Delays the response by `ms` — pair with a client abortSignal. */
  | { readonly kind: "hang"; readonly ms: number };

export interface MockLlmServer {
  readonly url: string;
  /** Every /chat/completions call, arrival order. */
  readonly requests: CapturedLlmRequest[];
  stop(): Promise<void>;
}

/** Minimal wire shape of an openai-compatible chat.completions request body. */
export interface ChatCompletionWireRequest {
  readonly model?: string;
  readonly stream?: boolean;
  readonly messages?: unknown[];
  readonly tools?: unknown[];
  readonly [key: string]: unknown;
}

/** A captured request body + auth header, in arrival order. */
export interface CapturedLlmRequest {
  readonly path: string;
  readonly auth?: string;
  /** Parsed JSON body (raw string if the client sent garbage). */
  readonly body: ChatCompletionWireRequest | string;
}

/** Fixed clock + per-server id counter keep responses byte-deterministic. */
const CREATED = 1_700_000_000;
function chunk(id: string, model: string, delta: unknown, finishReason: string | null): unknown {
  return {
    id,
    object: "chat.completion.chunk",
    created: CREATED,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function sseResponse(payloads: readonly unknown[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const payload of payloads) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream" },
  });
}

function completionResponse(
  id: string,
  model: string,
  message: Record<string, unknown>,
  finishReason: string,
): Response {
  return Response.json({
    id,
    object: "chat.completion",
    created: CREATED,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", ...message },
        finish_reason: finishReason,
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
}

/** Encode a happy turn as (id, model) → both wire shapes. */
function encodeTurn(
  turn: { kind: "text"; text: string } | { kind: "toolCalls"; toolCalls: readonly MockToolCall[] },
  id: string,
  model: string,
) {
  if (turn.kind === "text") {
    return {
      stream: [
        chunk(id, model, { role: "assistant" }, null),
        chunk(id, model, { content: turn.text }, null),
        chunk(id, model, {}, "stop"),
      ],
      json: () => completionResponse(id, model, { content: turn.text }, "stop"),
    };
  }
  const wireCalls = turn.toolCalls.map((call, index) => ({
    index,
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: call.arguments },
  }));
  return {
    stream: [
      chunk(id, model, { role: "assistant" }, null),
      chunk(id, model, { tool_calls: wireCalls }, null),
      chunk(id, model, {}, "tool_calls"),
    ],
    json: () => completionResponse(id, model, { tool_calls: wireCalls }, "tool_calls"),
  };
}

export function startMockLlm(turns: readonly MockTurn[]): MockLlmServer {
  const requests: CapturedLlmRequest[] = [];
  let next = 0;
  let counter = 0;

  const server = Bun.serve({
    port: 0,
    fetch: async (request: Request): Promise<Response> => {
      const path = new URL(request.url).pathname;
      if (request.method !== "POST" || !path.endsWith("/chat/completions")) {
        return new Response("not found", { status: 404 });
      }

      const rawBody = await request.text();
      let body: ChatCompletionWireRequest | string = rawBody;
      try {
        body = JSON.parse(rawBody) as ChatCompletionWireRequest;
      } catch {
        // keep the raw string; the provider always sends JSON, so this is a rig misuse signal
      }
      requests.push({
        path,
        auth: request.headers.get("authorization") ?? undefined,
        body,
      });

      const turn = turns[next];
      next += 1;
      if (turn === undefined) {
        // OpenAI wire error shape so the provider surfaces the message client-side.
        return Response.json(
          {
            error: {
              message: "mock llm: script exhausted — add the missing turn",
              type: "mock_error",
            },
          },
          { status: 500 },
        );
      }
      counter += 1;
      const id = `chatcmpl-mock-${counter}`;
      // The provider stamps its model id into the request; echo it back.
      const model =
        typeof body === "object" && typeof body.model === "string" ? body.model : "mock-model";
      if (turn.kind === "malformed") {
        return new Response(turn.body, {
          headers: { "content-type": "application/json" },
        });
      }
      if (turn.kind === "httpError") {
        return new Response(turn.body ?? "error", { status: turn.status });
      }
      if (turn.kind === "hang") {
        await new Promise((resolve) => setTimeout(resolve, turn.ms));
        return encodeTurn({ kind: "text", text: "late" }, id, model).json();
      }

      const encoded = encodeTurn(turn, id, model);
      const wantsStream = typeof body === "object" && body.stream === true;
      return wantsStream ? sseResponse(encoded.stream) : encoded.json();
    },
  });

  return {
    url: `http://localhost:${server.port}`,
    requests,
    stop: async () => server.stop(true),
  };
}
