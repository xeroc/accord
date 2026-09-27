/**
 * evidence/fetch.ts — framework-agnostic evidence-daemon fetches.
 *
 *   GET {endpoint}/evidence/{dispute}/for/{juror}          — juror delivery
 *     (ADR-0034: decrypt each round with the registered Delivery Key secret)
 *   GET {endpoint}/evidence/{subaccord}/{dispute}/{round}  — public manifest
 *
 * Both are the pure fetch — React apps wrap them in hooks
 * (see apps/app and apps/canon `useManifest.ts`).
 */
import { fromBase64 } from "./base64.js";
import type { JurorBundle } from "./ecies.js";

// ---------------------------------------------------------------------------
// Juror delivery — GET /evidence/{dispute}/for/{juror}
// ---------------------------------------------------------------------------

export interface FetchDeliveryParams {
  /** Daemon base URL (app-side `EVIDENCE_DAEMON_URL`). */
  endpoint: string;
  /** Dispute address, base58. */
  dispute: string;
  /** Juror address, base58 — delivery targets their registered Delivery Key. */
  juror: string;
}

/** One manifest entry's delivery status (v2 multifile derived index). */
export interface DeliveredFile {
  readonly path: string;
  readonly status: "stored" | "pending" | "out_of_band";
}

/**
 * One round's delivered package: a {@link JurorBundle} plus the v2 derived
 * per-entry index. `round` is the evidence round (or the synod party slot).
 */
export interface DeliveredRound extends JurorBundle {
  readonly round: number;
  readonly files: readonly DeliveredFile[];
  /** True iff every tracked entry is stored (always true for manifest-only). */
  readonly complete: boolean;
}

/** Type guard for one wire round: `{round, out, operator_ephem_pub, files?, complete?}`. */
function isWireRound(v: unknown): v is {
  round: number;
  out: string;
  operator_ephem_pub: string;
  files?: DeliveredFile[];
  complete?: boolean;
} {
  if (v === null || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r["round"] === "number" &&
    typeof r["out"] === "string" &&
    typeof r["operator_ephem_pub"] === "string" &&
    (r["files"] === undefined || Array.isArray(r["files"])) &&
    (r["complete"] === undefined || typeof r["complete"] === "boolean")
  );
}

/**
 * Pull the juror-bound delivery: one re-encrypted package per non-zero
 * evidence hash. Base64 wire fields are decoded to bytes so each round feeds
 * straight into `jurorDecryptDelivery`. `null` when nothing is deliverable
 * (404 — not drawn, no bundle, or no Delivery Key registered).
 */
export async function fetchDelivery(
  params: FetchDeliveryParams,
): Promise<DeliveredRound[] | null> {
  const { endpoint, dispute, juror } = params;
  const res = await fetch(`${endpoint}/evidence/${dispute}/for/${juror}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`evidence daemon returned ${res.status}`);
  const body = (await res.json()) as { rounds?: unknown };
  if (!Array.isArray(body.rounds) || !body.rounds.every(isWireRound)) {
    throw new Error("delivery response malformed");
  }
  return body.rounds.map((r) => ({
    round: r.round,
    out: fromBase64(r.out),
    operator_ephem_pub: fromBase64(r.operator_ephem_pub),
    files: r.files ?? [],
    complete: r.complete ?? true,
  }));
}

// ---------------------------------------------------------------------------
// Public manifest — GET /evidence/{subaccord}/{dispute}/{round}
// ---------------------------------------------------------------------------

export interface FetchManifestParams {
  endpoint: string;
  subaccord: string;
  dispute: string;
  round: number;
}

/**
 * Fetch the decrypted manifest (a YAML string for the `accord-evidence/v1`
 * format, or a parsed JSON object if the plaintext was JSON). `null` when no
 * bundle is stored for the round (404).
 */
export async function fetchManifest(
  params: FetchManifestParams,
): Promise<unknown> {
  const { endpoint, subaccord, dispute, round } = params;
  const res = await fetch(
    `${endpoint}/evidence/${subaccord}/${dispute}/${round}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`evidence daemon returned ${res.status}`);
  return res.json();
}
