// evidence.ts — evidence & domain-doc intake (bean accord-z801): the
// juror side of the evidence pipeline (ADR-0011/0034). All crypto and
// wire handling is imported from `@useaccord/sdk/evidence` — nothing is
// reimplemented here; this module owns daemon orchestration only:
//
//   1. Delivery-key handling: load-or-create the X25519 keypair from the
//      local state file (generate-once — a re-generated key would orphan
//      the daemon registration), then self-heal the registration against
//      the daemon with one wallet-signature PUT when stale/missing.
//   2. Bundle intake: fetch the juror-bound delivery, decrypt each round
//      with the Delivery Key secret, decode UTF-8 into documents.
//   3. Domain doc: GET /domains/{hash} (ADR-0027 CAS); optional — a
//      missing doc is an empty string, not a failure.
//   4. Assemble the runner's AgentContext with tools wired: chain readers
//      injected, evidence served from the decrypted in-memory bundle
//      (zero HTTP on tool calls), domain doc from the fetch.
//
// Failure policy: an unavailable daemon, an undeliverable dispute (404:
// not drawn / no bundle / no key), or a malformed/undecryptable bundle
// alerts via `notify` and throws a typed error — the pipeline abstains
// with kind `evidence-unavailable`. A partial context is never returned;
// there is no fallback evidence and no guessing.
import { readFile, writeFile } from "node:fs/promises";
import {
  ensureRegisteredDeliveryKey,
  fetchDelivery,
  jurorDecryptDelivery,
  loadOrCreateDeliveryKey,
  type DeliveryKeypair,
  type DeliveryKeyStorage,
  type SignMessage,
} from "@useaccord/sdk/evidence";

import { makeJuratTools } from "../agent/tools.js";
import type { InveigoCase } from "../chain/inveigo.js";
import type { AgentContext } from "../agent/runner.js";

/** Daemon transport/availability failures and empty deliveries. */
export class EvidenceUnavailableError extends Error {
  constructor(detail: string) {
    super(`EvidenceUnavailable: ${detail}`);
    this.name = "EvidenceUnavailableError";
  }
}

/** Delivery shape or decrypt failures — alert + abstain, never partial. */
export class MalformedBundleError extends Error {
  constructor(detail: string) {
    super(`MalformedBundle: ${detail}`);
    this.name = "MalformedBundleError";
  }
}

/** One decrypted evidence document, served to the agent tools. */
export interface EvidenceDocument {
  name: string;
  content: string;
}

/** Chain-account readers injected by the chain client (accord-lii9). */
export interface ChainReaders {
  readDispute(dispute: string): Promise<unknown>;
  readSubaccord(subaccord: string): Promise<unknown>;
  /** Inveigo case resolution for `read_case` (boss Item + verified thesis). */
  readCase(dispute: string): Promise<InveigoCase | null>;
}

/** Injected daemon access + notification. */
export interface EvidenceDeps {
  /** Evidence daemon base URL. */
  endpoint: string;
  /** Our registered Delivery Keypair (see `ensureJuratDeliveryKey`). */
  deliveryKey: DeliveryKeypair;
  notify(message: string): Promise<void>;
}

/**
 * File-backed Delivery Key storage for the daemon state dir — the node
 * counterpart of the SDK's browser storage port (ADR-0034 custody stays
 * app-side). The 64-byte serialized keypair sits at `path`.
 */
export function createFileDeliveryKeyStorage(path: string): DeliveryKeyStorage {
  return {
    get: async () => {
      try {
        const raw = new Uint8Array(await readFile(path));
        // The format is fixed 64 bytes; a single trailing \n (or \r\n) is
        // text-tool contamination (editor/echo), not key material — strip it
        // rather than forcing a regenerate (generate-once: a fresh key would
        // orphan the daemon registration).
        const end =
          raw.length > 64 && raw.at(-1) === 0x0a
            ? raw.length - (raw.at(-2) === 0x0d ? 2 : 1)
            : raw.length;
        return raw.slice(0, end);
      } catch {
        return null; // absent file — first run
      }
    },
    set: async (serialized) => {
      await writeFile(path, serialized);
    },
  };
}
export async function ensureJuratDeliveryKey(params: {
  endpoint: string;
  juror: string;
  signMessage: SignMessage;
  storage: DeliveryKeyStorage;
}): Promise<{ keypair: DeliveryKeypair; status: "current" | "re-registered" }> {
  const keypair = await loadOrCreateDeliveryKey(params.storage);
  const status = await ensureRegisteredDeliveryKey({
    endpoint: params.endpoint,
    juror: params.juror,
    encPub: keypair.publicKey,
    signMessage: params.signMessage,
  }).catch((err: unknown) => {
    throw new EvidenceUnavailableError(
      `delivery-key registration failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  return { keypair, status };
}

/** One duty ready for intake. `domainRef` is the Subaccord's on-chain `domain_ref`. */
export interface DutyIntakeInput {
  dispute: string;
  subaccord: string;
  /** Our operator pubkey (delivery target). */
  juror: string;
  numOptions: number;
  /** `Subaccord.domain_ref` hex — the domain-doc CAS hash (optional doc). */
  domainRef?: string;
  maxSteps?: number;
}

async function failUnavailable(
  deps: EvidenceDeps,
  dispute: string,
  detail: string,
): Promise<never> {
  await deps.notify(`[jurat] evidence unavailable for ${dispute}: ${detail} — abstaining`);
  throw new EvidenceUnavailableError(detail);
}

async function failMalformed(deps: EvidenceDeps, dispute: string, detail: string): Promise<never> {
  await deps.notify(`[jurat] malformed evidence bundle for ${dispute}: ${detail} — abstaining`);
  throw new MalformedBundleError(detail);
}

/**
 * Fetch + decrypt the juror-bound evidence bundle and the domain doc, and
 * assemble the runner's `AgentContext` over them. Every failure path
 * alerts and throws — a partial context is never returned.
 */
export async function assembleDutyContext(
  deps: EvidenceDeps,
  chain: ChainReaders,
  input: DutyIntakeInput,
): Promise<AgentContext> {
  let rounds;
  try {
    rounds = await fetchDelivery({
      endpoint: deps.endpoint,
      dispute: input.dispute,
      juror: input.juror,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The SDK reports exactly two fetch failures: a bad response shape
    // ("delivery response malformed") and everything else (daemon status /
    // transport — availability).
    if (/^delivery response malformed/.test(msg)) {
      return failMalformed(deps, input.dispute, `delivery fetch failed: ${msg}`);
    }
    return failUnavailable(deps, input.dispute, `delivery fetch failed: ${msg}`);
  }
  if (rounds === null) {
    return failUnavailable(
      deps,
      input.dispute,
      "nothing deliverable (404: not drawn, no bundle, or no delivery key)",
    );
  }

  const documents: EvidenceDocument[] = [];
  for (const round of rounds) {
    let plaintext: Uint8Array;
    try {
      plaintext = await jurorDecryptDelivery(round, deps.deliveryKey.secretKey);
    } catch (err) {
      return failMalformed(
        deps,
        input.dispute,
        `round ${round.round} decrypt failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    documents.push({ name: `round-${round.round}`, content: new TextDecoder().decode(plaintext) });
  }

  // Domain doc (ADR-0027 CAS): optional — absent is empty, not a failure.
  let domainDoc = "";
  if (input.domainRef) {
    try {
      const res = await fetch(`${deps.endpoint}/domains/${input.domainRef}`);
      if (res.ok) {
        domainDoc = await res.text();
      }
    } catch {
      // transport failure on an OPTIONAL input — evidence is what matters
    }
  }

  return {
    dispute: input.dispute,
    subaccord: input.subaccord,
    numOptions: input.numOptions,
    maxSteps: input.maxSteps,
    tools: makeJuratTools({
      ...chain,
      fetchEvidenceFile: async (dispute, file) => {
        const doc = documents.find((d) => d.name === file);
        if (!doc) {
          throw new Error(`no evidence document "${file}" for ${dispute}`);
        }
        return { name: doc.name, content: doc.content };
      },
      readDomainDoc: async () => domainDoc,
    }),
  };
}
