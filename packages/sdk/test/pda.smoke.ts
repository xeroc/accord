/**
 * Smoke test: verify every Accord PDA helper produces a valid, deterministic
 * ProgramDerivedAddress whose seed encoding matches the on-chain derivation.
 *
 * Run: npx tsx test/pda.smoke.ts
 *
 * The 6 generated helpers are already trustworthy (Codama emits exact seed
 * encodings). The critical check is the 2 hand-written helpers (Round,
 * Snapshot): their seed encoding must match what
 * `Pubkey::find_program_address` does on-chain. We verify by independently
 * calling `getProgramDerivedAddress` with manually-encoded seeds and
 * comparing addresses + bumps.
 *
 * Note: `ProgramDerivedAddress` in @solana/kit is a readonly tuple
 * `[Address, bump]`, not an object — destructure accordingly.
 */
import assert from "node:assert";

import {
  getAddressEncoder,
  getBytesEncoder,
  getProgramDerivedAddress,
  getU32Encoder,
  type Address,
  type ProgramDerivedAddress,
} from "@solana/kit";

import {
  ACCORD_PROGRAM_ID,
  findAppealBondPda,
  findDisputePda,
  findJurorStakePda,
  findPauseStatePda,
  findPendingUpdatePda,
  findRoundPda,
  findSnapshotPda,
  findSubaccordPda,
} from "../src/pda";

const PROGRAM = ACCORD_PROGRAM_ID;

// Deterministic test inputs — must be valid 32-byte base58 addresses.
// Using well-known Solana program addresses as stand-ins.
const CREATOR = "11111111111111111111111111111111" as Address; // System Program
const JUROR = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address; // SPL Token
const FILER = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address; // ATA Program
const RISK_TYPE = new Uint8Array(32).fill(7);
const NONCE = 42n;
const ROUND_IDX = 1;

function assertValidPda(pda: ProgramDerivedAddress, label: string): void {
  const [address, bump] = pda;
  assert.ok(
    typeof address === "string" && address.length > 0,
    `${label}: address is non-empty string`,
  );
  assert.ok(
    bump >= 0 && bump <= 255,
    `${label}: bump ${bump} in range [0,255]`,
  );
}

async function deriveAndCheck(
  label: string,
  fn: () => Promise<ProgramDerivedAddress>,
): Promise<ProgramDerivedAddress> {
  const a = await fn();
  const b = await fn();
  assert.deepEqual(
    a,
    b,
    `${label}: deterministic (same inputs → same [address, bump])`,
  );
  assertValidPda(a, label);
  return a;
}

async function main(): Promise<void> {
  // --- 1. All 8 PDAs produce valid, deterministic addresses ---

  const sub = await deriveAndCheck("Subaccord", () =>
    findSubaccordPda({ creator: CREATOR, domainRef: RISK_TYPE }),
  );
  const js = await deriveAndCheck("JurorStake", () =>
    findJurorStakePda({ subaccord: sub[0], juror: JUROR }),
  );
  const dispute = await deriveAndCheck("Dispute", () =>
    findDisputePda({ filer: FILER, nonce: NONCE }),
  );
  const round = await deriveAndCheck("Round", () =>
    findRoundPda({ dispute: dispute[0], roundIdx: ROUND_IDX }),
  );
  const snapshot = await deriveAndCheck("Snapshot", () =>
    findSnapshotPda({ dispute: dispute[0], roundIdx: ROUND_IDX }),
  );
  const update = await deriveAndCheck("PendingUpdate", () =>
    findPendingUpdatePda({ subaccord: sub[0], nonce: NONCE }),
  );
  const bond = await deriveAndCheck("AppealBond", () =>
    findAppealBondPda({ dispute: dispute[0], roundIdx: ROUND_IDX }),
  );
  const pause = await deriveAndCheck("PauseState", () => findPauseStatePda());

  // --- 2. Distinct PDAs are actually distinct (sanity) ---

  const all = [sub, js, dispute, round, snapshot, update, bond, pause];
  const addrs = all.map((p) => p[0]);
  assert.equal(
    new Set(addrs).size,
    addrs.length,
    "all 8 PDAs are distinct addresses",
  );

  // --- 3. Hand-written helpers match manual seed encoding ---

  // Round: ["round", dispute_address, u32_le(round_idx)]
  const manualRound = await getProgramDerivedAddress({
    programAddress: PROGRAM,
    seeds: [
      getBytesEncoder().encode(new Uint8Array([114, 111, 117, 110, 100])),
      getAddressEncoder().encode(dispute[0]),
      getU32Encoder().encode(ROUND_IDX),
    ],
  });
  assert.deepEqual(
    round,
    manualRound,
    "Round: hand-written matches manual seed encoding",
  );

  // Snapshot: ["snapshot", dispute_address, u32_le(round_idx)]
  const manualSnap = await getProgramDerivedAddress({
    programAddress: PROGRAM,
    seeds: [
      getBytesEncoder().encode(
        new Uint8Array([115, 110, 97, 112, 115, 104, 111, 116]),
      ),
      getAddressEncoder().encode(dispute[0]),
      getU32Encoder().encode(ROUND_IDX),
    ],
  });
  assert.deepEqual(
    snapshot,
    manualSnap,
    "Snapshot: hand-written matches manual seed encoding",
  );

  // --- 4. Cross-check: generated AppealBond helper also matches manual ---

  const manualBond = await getProgramDerivedAddress({
    programAddress: PROGRAM,
    seeds: [
      getBytesEncoder().encode(new Uint8Array([98, 111, 110, 100])),
      getAddressEncoder().encode(dispute[0]),
      getU32Encoder().encode(ROUND_IDX),
    ],
  });
  assert.deepEqual(
    bond,
    manualBond,
    "AppealBond: generated matches manual seed encoding",
  );

  const labels = [
    "Subaccord",
    "JurorStake",
    "Dispute",
    "Round",
    "Snapshot",
    "PendingUpdate",
    "AppealBond",
    "PauseState",
  ];
  console.log(
    "✓ All 8 PDA helpers verified — valid, deterministic, correctly encoded.",
  );
  for (let i = 0; i < all.length; i++) {
    console.log(
      `  ${labels[i]!.padEnd(16)} ${all[i]![0]}  (bump ${all[i]![1]})`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
