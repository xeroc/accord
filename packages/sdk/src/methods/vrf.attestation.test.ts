// vrf.attestation.test.ts — PROG-ATTESTTION: the attestation-gated
// `drawSeat` (optional remaining SAS attestation at remaining_accounts[1],
// read-only, after the writable JurorStake at [0]).
//
// Mirrors staking.attestation.test.ts: the pure orchestration modules are the
// only dist artifacts that load under `node --test`, so the pure `drawSeat`
// facade is driven through stub seams; the real adapter wiring is exercised
// end-to-end against the validator (tests/src/attestation.spec.ts).
//
// Excluded from the build; run via: pnpm --filter @useaccord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import { AccountRole, type Address, type Instruction } from "@solana/kit";

import { drawSeat, type AccordVrfClient, type SeatMembership, type VrfDrawAccounts } from "./vrf.ts";

const PROGRAM = "P".repeat(44) as Address;
const ATTESTATION = "A".repeat(44) as Address;
const ROUND = "R".repeat(44) as Address;
const JUROR_STAKE = "JS".repeat(22) as Address;

const ACCOUNTS: VrfDrawAccounts = {
  caller: "C".repeat(44) as Address,
  subaccord: "S".repeat(44) as Address,
  dispute: "D".repeat(44) as Address,
};

const MEMBERSHIP: SeatMembership = {
  leaf: { juror: new Uint8Array(32).fill(1), stake: 5_000n },
  index: 0,
  proof: [],
  jurorStake: JUROR_STAKE,
  retries: 0,
};

/** A recording seam: captures the input `buildDrawSeat` was called with. */
function recordingClient() {
  const seen: { attestation?: Address } = {};
  const I = {} as Instruction;
  const client = {
    buildDrawSeat: (i: { attestation?: Address }) => ((seen.attestation = i.attestation), I),
  } as AccordVrfClient;
  return { seen, client };
}

test("drawSeat: omits attestation by default (stake-only Subaccords keep today's behavior)", () => {
  const { seen, client } = recordingClient();
  drawSeat(client, PROGRAM, ACCOUNTS, ROUND, 0, MEMBERSHIP);
  assert.equal(seen.attestation, undefined);
});

test("drawSeat: forwards attestation on credential-gated Subaccords (7th positional arg)", () => {
  const { seen, client } = recordingClient();
  drawSeat(client, PROGRAM, ACCOUNTS, ROUND, 0, MEMBERSHIP, ATTESTATION);
  assert.equal(seen.attestation, ATTESTATION);
});

// --- instruction-shape contract: mirrors adapter.ts buildDrawSeat -----------
// The on-chain `DrawSeat` struct orders accounts caller(signer) →
// dispute(writable) → subaccord(readonly) → round(writable) →
// systemProgram(readonly); remaining_accounts[0] is the drawn juror's
// JurorStake PDA (writable) and [1] the SAS attestation (read-only, gated
// pools only).

function shapeClient(): AccordVrfClient {
  return {
    buildDrawSeat: (input: { jurorStake: Address; attestation?: Address }) =>
      Object.freeze({
        programAddress: PROGRAM,
        data: new Uint8Array(),
        accounts: Object.freeze([
          { address: ACCOUNTS.caller, role: AccountRole.WRITABLE_SIGNER },
          { address: ACCOUNTS.dispute, role: AccountRole.WRITABLE },
          { address: ACCOUNTS.subaccord, role: AccountRole.READONLY },
          { address: ROUND, role: AccountRole.WRITABLE },
          { address: "11111111111111111111111111111111" as Address, role: AccountRole.READONLY },
          { address: input.jurorStake, role: AccountRole.WRITABLE },
          ...(input.attestation
            ? [{ address: input.attestation, role: AccountRole.READONLY }]
            : []),
        ]),
      }) as unknown as Instruction,
  } as AccordVrfClient;
}

type Meta = { address: Address; role: number };
const metas = (ix: Instruction): Meta[] =>
  (ix as Instruction & { accounts: Meta[] }).accounts;

test("drawSeat instruction: attestation is remaining_accounts[1], read-only, after the JurorStake", () => {
  const accts = metas(drawSeat(shapeClient(), PROGRAM, ACCOUNTS, ROUND, 0, MEMBERSHIP, ATTESTATION));
  assert.equal(accts.length, 7, "5 fixed DrawSeat accounts + JurorStake + attestation");
  assert.equal(accts[5]!.address, JUROR_STAKE);
  assert.equal(accts[5]!.role, AccountRole.WRITABLE, "JurorStake stays writable at [0]");
  assert.equal(accts[6]!.address, ATTESTATION);
  assert.equal(accts[6]!.role, AccountRole.READONLY, "attestation is read-only at [1]");
});

test("drawSeat instruction: no attestation appended on stake-only pools (6 accounts)", () => {
  const accts = metas(drawSeat(shapeClient(), PROGRAM, ACCOUNTS, ROUND, 0, MEMBERSHIP));
  assert.equal(accts.length, 6);
  assert.equal(accts[5]!.address, JUROR_STAKE);
});
