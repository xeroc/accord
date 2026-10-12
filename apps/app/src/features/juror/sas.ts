/**
 * sas.ts — matching juror SAS attestations against gated Subaccords.
 *
 * Display-side logic for the ADR-0024 credential gate: which pools are gated,
 * which attestations unlock them, whether a juror merits the 🛡️ shield badge,
 * and how an attestation's expiry reads. Data comes from the SDK
 * (`findSasAttestations`, `findAllSubaccords`, JurorStake queries); this module
 * only joins them.
 */
import type { Address } from "@solana/kit";
import type { SasAttestation } from "@useaccord/sdk";

/** Solana `Pubkey::default()` (all-zeros) — the "unset" gate binding. */
export const DEFAULT_PUBKEY =
  "11111111111111111111111111111111" as Address;

/** The immutable ADR-0024 gate binding every Subaccord carries. */
export interface CredentialBinding {
  jurorCredential: Address;
  jurorSchema: Address;
}

/** Minimal account shape the join needs — `Account<T>` satisfies it. */
export interface AttestationRef {
  address: Address;
  data: SasAttestation;
}

/** Gated pool: both bindings set (both-or-neither is enforced on-chain). */
export function isGated(binding: CredentialBinding): boolean {
  return (
    binding.jurorCredential !== DEFAULT_PUBKEY &&
    binding.jurorSchema !== DEFAULT_PUBKEY
  );
}

/** True when `attestation` satisfies `binding`'s gate (credential + schema). */
export function satisfiesGate(
  attestation: SasAttestation,
  binding: CredentialBinding,
): boolean {
  return (
    isGated(binding) &&
    attestation.credential === binding.jurorCredential &&
    attestation.schema === binding.jurorSchema
  );
}

/** A juror's attestation paired with the subaccords whose gate it unlocks. */
export interface AttachedAttestation {
  address: Address;
  attestation: SasAttestation;
  unlocks: Address[];
}

/**
 * Pair every attestation with the subaccords whose `(credential, schema)` it
 * satisfies. Attestations binding other wallets can appear here when the
 * caller scanned globally — filter by `attestation.wallet` at the call site.
 */
export function attachAttestations(
  attestations: readonly AttestationRef[],
  subaccords: readonly { address: Address; data: CredentialBinding }[],
): AttachedAttestation[] {
  return attestations.map((a) => ({
    address: a.address,
    attestation: a.data,
    unlocks: subaccords
      .filter((s) => satisfiesGate(a.data, s.data))
      .map((s) => s.address),
  }));
}

/**
 * 🛡️ predicate for the browse table: the juror holds an attestation binding
 * their wallet that satisfies the gate of a gated subaccord they stake in.
 * `stakeBindings` are the bindings of the subaccords the juror actively
 * stakes in (staked > 0).
 */
export function isShieldedJuror(
  juror: Address,
  attestations: readonly AttestationRef[],
  stakeBindings: readonly CredentialBinding[],
): boolean {
  return attestations.some(
    (a) =>
      a.data.wallet === juror &&
      stakeBindings.some((binding) => satisfiesGate(a.data, binding)),
  );
}

/** Display state of an attestation expiry (`0n` ⇒ never expires). */
export type ExpiryState = "never" | "valid" | "expired";

export function expiryState(expiry: bigint, nowSec: number): ExpiryState {
  if (expiry === 0n) return "never";
  return expiry <= BigInt(Math.floor(nowSec)) ? "expired" : "valid";
}
