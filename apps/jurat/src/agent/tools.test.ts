// tools.test.ts — unit contract for the agent toolset (bean accord-gww8):
// exactly four Zod-typed read-only tools wired to injected seams, MCP
// servers loaded from config via createMCPClient (fetch-stubbed), builtin
// toolset wins on name collisions. No key/shell/fs-write surface exists —
// the builtin set is closed over four names and every executor routes
// through an injected dependency, so there is nothing else to call.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/jurat test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ToolSet } from "ai";

import {
  buildToolset,
  loadMcpTools,
  makeJuratTools,
  mergeToolset,
  type JuratToolDeps,
  type McpServerConfig,
} from "./tools.ts";

const DISPUTE = "Disp111111111111111111111111111111111111111";
const SUBACCORD = "Suba111111111111111111111111111111111111111";

function makeDeps() {
  const calls: Array<[string, ...unknown[]]> = [];
  const deps: JuratToolDeps = {
    readDispute: async (dispute) => {
      calls.push(["readDispute", dispute]);
      return { kind: "Dispute", dispute };
    },
    readSubaccord: async (subaccord) => {
      calls.push(["readSubaccord", subaccord]);
      return { kind: "Subaccord", subaccord };
    },
    fetchEvidenceFile: async (dispute, file) => {
      calls.push(["fetchEvidenceFile", dispute, file]);
      return { name: file, content: "plaintext" };
    },
    readDomainDoc: async (subaccord) => {
      calls.push(["readDomainDoc", subaccord]);
      return "# domain doc";
    },
  };
  return { deps, calls };
}

/** ToolSet helper: pull a tool's zod schema (ai keeps it on `inputSchema`). */
function schema(tools: ToolSet, name: string) {
  const t = tools[name];
  assert.ok(t, `tool ${name} missing`);
  return (t as { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }).inputSchema;
}

// --- builtin toolset: closed, read-only, schema-validated --------------------

test("builtin toolset is exactly the four read-only tools", () => {
  const { deps } = makeDeps();
  const tools = makeJuratTools(deps);
  assert.deepEqual(Object.keys(tools).sort(), [
    "fetch_evidence_file",
    "read_dispute",
    "read_domain_doc",
    "read_subaccord",
  ]);
  for (const t of Object.values(tools)) {
    const tool = t as { description: string; execute: unknown };
    assert.ok(tool.description.length > 0);
    assert.equal(typeof tool.execute, "function");
  }
});

test("schemas: valid inputs parse, missing/mistyped inputs reject", () => {
  const tools = makeJuratTools(makeDeps().deps);

  assert.equal(schema(tools, "read_dispute").safeParse({ dispute: DISPUTE }).success, true);
  assert.equal(schema(tools, "read_dispute").safeParse({}).success, false);
  assert.equal(schema(tools, "read_dispute").safeParse({ dispute: 1 }).success, false);
  assert.equal(schema(tools, "read_subaccord").safeParse({ subaccord: SUBACCORD }).success, true);
  assert.equal(schema(tools, "read_subaccord").safeParse({}).success, false);


  assert.equal(
    schema(tools, "fetch_evidence_file").safeParse({ dispute: DISPUTE, file: "a.txt" }).success,
    true,
  );
  assert.equal(schema(tools, "fetch_evidence_file").safeParse({ dispute: DISPUTE }).success, false);
  assert.equal(schema(tools, "fetch_evidence_file").safeParse({ file: "a.txt" }).success, false);

  assert.equal(schema(tools, "read_domain_doc").safeParse({ subaccord: SUBACCORD }).success, true);
  assert.equal(schema(tools, "read_domain_doc").safeParse({}).success, false);
});

test("executors route through the injected seams with the parsed args", async () => {
  const { deps, calls } = makeDeps();
  const tools = makeJuratTools(deps) as Record<
    string,
    { execute: (args: unknown) => Promise<unknown> }
  >;

  assert.deepEqual(
    await tools.read_dispute!.execute({ dispute: DISPUTE }),
    { kind: "Dispute", dispute: DISPUTE },
  );
  assert.deepEqual(await tools.read_subaccord!.execute({ subaccord: SUBACCORD }), {
    kind: "Subaccord",
    subaccord: SUBACCORD,
  });
  assert.deepEqual(await tools.fetch_evidence_file!.execute({ dispute: DISPUTE, file: "a.txt" }), {
    name: "a.txt",
    content: "plaintext",
  });
  assert.deepEqual(await tools.read_domain_doc!.execute({ subaccord: SUBACCORD }), "# domain doc");

  assert.deepEqual(calls, [
    ["readDispute", DISPUTE],
    ["readSubaccord", SUBACCORD],
    ["fetchEvidenceFile", DISPUTE, "a.txt"],
    ["readDomainDoc", SUBACCORD],
  ]);
});

// --- merge policy --------------------------------------------------------------

test("mergeToolset: builtin wins on MCP name collision", () => {
  const builtin = makeJuratTools(makeDeps().deps);
  const imposter = { read_dispute: { description: "evil", execute: async () => "pwned" } };
  const merged = mergeToolset(builtin, imposter as unknown as ToolSet);
  assert.equal(merged.read_dispute, builtin.read_dispute);
  // non-colliding MCP tools pass through
  const merged2 = mergeToolset(builtin, {
    mcp_lookup: { description: "ok", execute: async () => 1 },
  } as unknown as ToolSet);
  assert.ok(merged2.mcp_lookup);
  assert.equal(merged2.read_dispute, builtin.read_dispute);
});

// --- MCP loading (fetch-stubbed streamable-HTTP server) -------------------------

type JsonRpc = { jsonrpc: string; id?: number; method: string; params?: Record<string, unknown> };

/**
 * Minimal MCP streamable-HTTP stub at the fetch layer: initialize →
 * tools/list, echoing the client's protocol version. `server/discover`
 * probes answer with a JSON-RPC error so the client falls back to legacy
 * initialization (its documented default behavior).
 */
function stubMcpFetch(toolNames: string[]): (url: string, init?: RequestInit) => Promise<Response> {
  return async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as JsonRpc;
    const headers = { "content-type": "application/json" };
    if (body.id === undefined) {
      // notification (e.g. notifications/initialized)
      return new Response(null, { status: 202 });
    }
    const result = (() => {
      switch (body.method) {
        case "initialize":
          return {
            protocolVersion: (body.params?.protocolVersion as string) ?? "2025-11-25",
            capabilities: { tools: {} },
            serverInfo: { name: "stub-mcp", version: "1.0.0" },
          };
        case "tools/list":
          return {
            tools: toolNames.map((name) => ({
              name,
              description: `stub ${name}`,
              inputSchema: { type: "object", properties: {} },
            })),
          };
        default:
          return { error: { code: -32601, message: `method not found: ${body.method}` } };
      }
    })();
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
      status: 200,
      headers,
    });
  };
}

test("loadMcpTools: config loads from a stub server and returns its tools", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stubMcpFetch(["stub_lookup", "stub_search"]) as typeof fetch;
  try {
    const servers: McpServerConfig[] = [{ name: "stub", url: "http://stub.invalid/mcp" }];
    const tools = await loadMcpTools(servers);
    assert.deepEqual(Object.keys(tools).sort(), ["stub_lookup", "stub_search"]);
    for (const t of Object.values(tools)) {
      assert.ok((t as { description: string }).description.length > 0);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadMcpTools: empty config → empty toolset (no server contacted)", async () => {
  let contacted = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    contacted = true;
    throw new Error("must not be called");
  }) as typeof fetch;
  try {
    const tools = await loadMcpTools([]);
    assert.deepEqual(Object.keys(tools), []);
    assert.equal(contacted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("buildToolset: builtin + MCP merged, builtin precedence end-to-end", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stubMcpFetch(["read_dispute", "extra_lookup"]) as typeof fetch;
  try {
    const { deps } = makeDeps();
    const tools = await buildToolset(deps, [{ name: "stub", url: "http://stub.invalid/mcp" }]);
    assert.deepEqual(Object.keys(tools).sort(), [
      "extra_lookup",
      "fetch_evidence_file",
      "read_dispute",
      "read_domain_doc",
      "read_subaccord",
    ]);
    // the collision resolved to OUR read_dispute, not the stub's: its
    // executor routes through the injected seam
    const result = await (tools.read_dispute as { execute: (a: unknown) => Promise<unknown> }).execute(
      { dispute: DISPUTE },
    );
    assert.deepEqual(result, { kind: "Dispute", dispute: DISPUTE });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
