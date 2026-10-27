// mock-llm.ts — jest-side mock openai-compatible LLM server for the jurat
// e2e (bean accord-wnqf). The agent-testing rig (apps/jurat/src/agent/
// testing/mock-llm.ts, bean accord-f3ir) is Bun-bound (`Bun.serve`); jest
// runs node, so this is the node:http twin of the same wire contract: one
// responder callback decides every /chat/completions reply, each request is
// captured in arrival order. Deterministic by construction — no model, no
// network beyond loopback.

import http from "node:http";
import { AddressInfo } from "node:net";

/** One captured /chat/completions request (parsed body + auth header). */
export interface MockLlmRequest {
  readonly body: Record<string, unknown>;
  readonly auth?: string;
}

/** Responder verdict for one request: raw HTTP status + JSON body. */
export interface MockLlmReply {
  readonly status: number;
  readonly body: unknown;
}

export type MockResponder = (body: Record<string, unknown>) => MockLlmReply;

export interface MockLlmServer {
  /** Base URL incl. the `/v1` prefix the openai-compatible provider expects. */
  readonly baseURL: string;
  readonly requests: MockLlmRequest[];
  stop(): Promise<void>;
}

export function startMockLlm(respond: MockResponder): Promise<MockLlmServer> {
  const requests: MockLlmRequest[] = [];
  const { promise: listening, resolve: onListening } = Promise.withResolvers<void>();
  const { promise: closed, resolve: onClosed } = Promise.withResolvers<void>();
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      const body = JSON.parse(data) as Record<string, unknown>;
      requests.push({ body, auth: req.headers.authorization });
      const reply = respond(body);
      res.statusCode = reply.status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(reply.body));
    });
  });
  server.listen(0, "127.0.0.1", onListening);
  server.on("close", onClosed);
  return listening.then(() => ({
    baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    requests,
    stop: () => {
      server.closeAllConnections(); // provider keep-alive sockets would hang close()
      server.close();
      return closed;
    },
  }));
}

/** A 200 chat.completion carrying `content` as the assistant message. */
export function chatCompletion(content: string): MockLlmReply {
  return {
    status: 200,
    body: {
      id: "chatcmpl-mock",
      object: "chat.completion",
      created: 1_700_000_000,
      model: "mock-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    },
  };
}

/** A 200 chat.completion answering with one function call (tool_choice:"required" step). */
export function toolCallCompletion(name: string, args: string): MockLlmReply {
  return {
    status: 200,
    body: {
      id: "chatcmpl-mock",
      object: "chat.completion",
      created: 1_700_000_000,
      model: "mock-model",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              { index: 0, id: "call-1", type: "function", function: { name, arguments: args } },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    },
  };
}

/** An OpenAI wire-shaped error (the provider surfaces the message client-side). */
export function openAiError(status: number, message: string): MockLlmReply {
  return { status, body: { error: { message, type: "mock_error" } } };
}
