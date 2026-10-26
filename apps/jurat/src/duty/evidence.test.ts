// evidence.test.ts — unit contract for evidence & domain-doc intake (bean
// accord-z801): delivery-key handling (ADR-0034) with file persistence and
// daemon registration self-heal, juror-bound bundle fetch → decrypt →
// documents, domain-doc fetch, AgentContext assembly. Daemon responses are
// stubbed at the fetch layer; bundle payloads are REAL crypto (encrypted
// with the SDK's deliverToDeliveryKey) so the decrypt path is exercised
// end to end. Malformed/unavailable bundles alert + throw — the pipeline
// abstains; nothing partial is ever assembled.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/jurat test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ed25519 } from "@noble/curves/ed25519";
import {
  deliverToDeliveryKey,
  encodeDeliveryKeypair,
  generateDeliveryKey,
  loadOrCreateDeliveryKey,
  type DeliveryKeypair,
  type SignMessage,
} from "@useaccord/sdk/evidence";

import {
  EvidenceUnavailableError,
  MalformedBundleError,
  assembleDutyContext,
  createFileDeliveryKeyStorage,
  ensureJuratDeliveryKey,
  type ChainReaders,
  type EvidenceDeps,
} from "./evidence.ts";

const ENDPOINT = "http://evidence.invalid";
const DISPUTE = "Disp111111111111111111111111111111111111111";
const SUBACCORD = "Suba111111111111111111111111111111111111111";
const JUROR = "Juror111111111111111111111111111111111111111";
const DOMAIN_HASH = "ab".repeat(32);
const PLAINTEXT = "accord-evidence manifest: claimant brief + contract excerpts";

const KEYPAIR = generateDeliveryKey();
const OP_SEED = new Uint8Array(32).fill(3);
const signMessage: SignMessage = async (msg) => ed25519.sign(msg, OP_SEED);

interface StubCalls {
  method: string;
  path: string;
  body?: string;
}

/**
 * Patch globalThis.fetch with a stub daemon: route table keyed by
 * `METHOD path`. Unpatch on close(). The delivery payload is a real
 * `deliverToDeliveryKey` bundle so decrypt is exercised for real.
 */
function stubDaemon(
  routes: Array<{ method: string; path: string; handler: (call: StubCalls) => Response }>,
) {
  const calls: StubCalls[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: StubCalls = {
      method: init?.method ?? "GET",
      path: url.pathname,
      body: init?.body as string | undefined,
    };
    calls.push(call);
    for (const route of routes) {
      if (route.method === call.method && route.path === call.path) {
        return route.handler(call);
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return {
    calls,
    close: () => {
      globalThis.fetch = original;
    },
  };
}

/** Real encrypted delivery body for the given plaintext + delivery key. */
async function deliveryBody(keypair: DeliveryKeypair, plaintext = PLAINTEXT): Promise<string> {
  const bundle = await deliverToDeliveryKey(new TextEncoder().encode(plaintext), keypair.publicKey);
  return JSON.stringify({
    rounds: [
      {
        round: 0,
        out: Buffer.from(bundle.out).toString("base64"),
        operator_ephem_pub: Buffer.from(bundle.operator_ephem_pub).toString("base64"),
      },
    ],
  });
}

function evidenceDeps(notified: string[]): EvidenceDeps {
  return { endpoint: ENDPOINT, deliveryKey: KEYPAIR, notify: async (m) => notified.push(m) };
}

const CHAIN: ChainReaders = {
  readDispute: async () => ({ numOptions: 3, state: "Commit" }),
  readSubaccord: async () => ({ domainRef: DOMAIN_HASH, aggregation: "Plurality" }),
  readCase: async () => null,
};

function dutyInput() {
  return {
    dispute: DISPUTE,
    subaccord: SUBACCORD,
    juror: JUROR,
    numOptions: 3,
    domainRef: DOMAIN_HASH,
  };
}

// --- delivery-key handling ------------------------------------------------------

test("file storage tolerates a text-tool trailing newline (fixed 64-byte format)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jurat-delkey-nl-"));
  try {
    const storage = createFileDeliveryKeyStorage(join(dir, "delivery.key"));
    const keypair = await loadOrCreateDeliveryKey(storage);
    // Editor/echo contamination: a single \n (or \r\n) after the 64 bytes.
    const clean = await storage.get();
    await writeFile(join(dir, "delivery.key"), new Uint8Array([...clean!, 0x0a]));
    const reloaded = await loadOrCreateDeliveryKey(storage);
    assert.deepEqual(reloaded.publicKey, keypair.publicKey);
    assert.deepEqual(reloaded.secretKey, keypair.secretKey);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("file storage: null when absent, round-trips the keypair, generate-once via ensure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jurat-delkey-"));
  try {
    const storage = createFileDeliveryKeyStorage(join(dir, "delivery.key"));
    assert.equal(await storage.get(), null);

    const stub = stubDaemon([
      {
        method: "GET",
        path: `/jurors/${JUROR}/delivery-key`,
        handler: () => new Response("{}", { status: 404 }),
      },
      {
        method: "PUT",
        path: `/jurors/${JUROR}/delivery-key`,
        handler: () => new Response(null, { status: 201 }),
      },
    ]);
    try {
      const first = await ensureJuratDeliveryKey({
        endpoint: ENDPOINT,
        juror: JUROR,
        signMessage,
        storage,
      });
      assert.equal(first.status, "re-registered"); // first registration PUT
      assert.equal(stub.calls.filter((c) => c.method === "PUT").length, 1);

      // generate-once: the persisted key comes back unchanged (the daemon
      // here still answers 404 on GET, so the second call self-heals with
      // another PUT — but never with a different key)
      const second = await ensureJuratDeliveryKey({
        endpoint: ENDPOINT,
        juror: JUROR,
        signMessage,
        storage,
      });
      assert.deepEqual(encodeDeliveryKeypair(second.keypair), encodeDeliveryKeypair(first.keypair));
    } finally {
      stub.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("already-current key: no PUT (self-heal says current)", async () => {
  const stub = stubDaemon([
    {
      method: "GET",
      path: `/jurors/${JUROR}/delivery-key`,
      handler: () =>
        Response.json({
          enc_pub: Buffer.from(KEYPAIR.publicKey).toString("base64"),
          registered_at: 1,
        }),
    },
  ]);
  try {
    const storage = { get: async () => encodeDeliveryKeypair(KEYPAIR), set: async () => {} };
    const result = await ensureJuratDeliveryKey({
      endpoint: ENDPOINT,
      juror: JUROR,
      signMessage,
      storage,
    });
    assert.equal(result.status, "current");
    assert.equal(stub.calls.filter((c) => c.method === "PUT").length, 0);
  } finally {
    stub.close();
  }
});

// --- bundle fetch → decrypt → context ----------------------------------------------

test("happy path: decrypts the delivered bundle and assembles a working AgentContext", async () => {
  const stub = stubDaemon([
    {
      method: "GET",
      path: `/evidence/${DISPUTE}/for/${JUROR}`,
      handler: async () =>
        new Response(await deliveryBody(KEYPAIR), {
          headers: { "content-type": "application/json" },
        }),
    },
    {
      method: "GET",
      path: `/domains/${DOMAIN_HASH}`,
      handler: () => new Response("# rubric"),
    },
  ]);
  try {
    const notified: string[] = [];
    const context = await assembleDutyContext(evidenceDeps(notified), CHAIN, dutyInput());

    assert.equal(context.dispute, DISPUTE);
    assert.equal(context.numOptions, 3);
    assert.equal(notified.length, 0);

    // tools wired: evidence served from the decrypted bundle (no HTTP),
    // chain readers routed through, domain doc fetched
    const tools = context.tools as Record<string, { execute: (a: unknown) => Promise<unknown> }>;
    const doc = (await tools.fetch_evidence_file!.execute({
      dispute: DISPUTE,
      file: "round-0",
    })) as {
      content: string;
    };
    assert.equal(doc.content, PLAINTEXT);
    assert.deepEqual(await tools.read_dispute!.execute({ dispute: DISPUTE }), {
      numOptions: 3,
      state: "Commit",
    });
    assert.equal(await tools.read_domain_doc!.execute({ subaccord: SUBACCORD }), "# rubric");
    assert.equal(await tools.read_case!.execute({ dispute: DISPUTE }), null);
  } finally {
    stub.close();
  }
});

test("missing domain doc is not a failure — empty string (optional input)", async () => {
  const stub = stubDaemon([
    {
      method: "GET",
      path: `/evidence/${DISPUTE}/for/${JUROR}`,
      handler: async () =>
        new Response(await deliveryBody(KEYPAIR), {
          headers: { "content-type": "application/json" },
        }),
    },
    {
      method: "GET",
      path: `/domains/${DOMAIN_HASH}`,
      handler: () => new Response("nope", { status: 404 }),
    },
  ]);
  try {
    const context = await assembleDutyContext(evidenceDeps([]), CHAIN, dutyInput());
    const tools = context.tools as Record<string, { execute: (a: unknown) => Promise<unknown> }>;
    assert.equal(await tools.read_domain_doc!.execute({ subaccord: SUBACCORD }), "");
  } finally {
    stub.close();
  }
});

// --- failure paths: alert + typed error, never a partial context ------------------

test("delivery 404 (not drawn / no bundle / no key) → EvidenceUnavailableError + alert", async () => {
  const stub = stubDaemon([
    {
      method: "GET",
      path: `/evidence/${DISPUTE}/for/${JUROR}`,
      handler: () => new Response("{}", { status: 404 }),
    },
  ]);
  try {
    const notified: string[] = [];
    await assert.rejects(
      () => assembleDutyContext(evidenceDeps(notified), CHAIN, dutyInput()),
      EvidenceUnavailableError,
    );
    assert.equal(notified.length, 1);
    assert.match(notified[0]!, /evidence/i);
    assert.match(notified[0]!, /Disp1111/);
  } finally {
    stub.close();
  }
});

test("tampered ciphertext → MalformedBundleError + alert (auth tag fails)", async () => {
  const body = JSON.parse(await deliveryBody(KEYPAIR)) as {
    rounds: Array<{ round: number; out: string; operator_ephem_pub: string }>;
  };
  const out = Buffer.from(body.rounds[0]!.out, "base64");
  out[0] ^= 0xff; // corrupt
  body.rounds[0]!.out = out.toString("base64");

  const stub = stubDaemon([
    {
      method: "GET",
      path: `/evidence/${DISPUTE}/for/${JUROR}`,
      handler: () => Response.json(body),
    },
  ]);
  try {
    const notified: string[] = [];
    await assert.rejects(
      () => assembleDutyContext(evidenceDeps(notified), CHAIN, dutyInput()),
      MalformedBundleError,
    );
    assert.equal(notified.length, 1);
  } finally {
    stub.close();
  }
});

test("shape-malformed delivery body → MalformedBundleError + alert", async () => {
  for (const body of [{ rounds: "nope" }, { nope: true }, {}]) {
    const stub = stubDaemon([
      {
        method: "GET",
        path: `/evidence/${DISPUTE}/for/${JUROR}`,
        handler: () => Response.json(body),
      },
    ]);
    try {
      const notified: string[] = [];
      await assert.rejects(
        () => assembleDutyContext(evidenceDeps(notified), CHAIN, dutyInput()),
        MalformedBundleError,
      );
      assert.equal(notified.length, 1, JSON.stringify(body));
    } finally {
      stub.close();
    }
  }
});

test("daemon transport failure → EvidenceUnavailableError + alert", async () => {
  const stub = stubDaemon([
    {
      method: "GET",
      path: `/evidence/${DISPUTE}/for/${JUROR}`,
      handler: () => new Response("boom", { status: 503 }),
    },
  ]);
  try {
    const notified: string[] = [];
    await assert.rejects(
      () => assembleDutyContext(evidenceDeps(notified), CHAIN, dutyInput()),
      EvidenceUnavailableError,
    );
    assert.equal(notified.length, 1);
  } finally {
    stub.close();
  }
});
