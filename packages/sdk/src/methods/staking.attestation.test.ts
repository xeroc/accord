// staking.attestation.test.ts — PROG-ATTESTATION: the attestation-gated
// `stake` (optional remaining SAS attestation) + the `prune_juror` crank.
//
// The SDK's pure orchestration modules are the only dist artifacts that load
// under `node --test` (the generated Codama client emits `../pdas` directory
// imports that Node ESM rejects), so — like staking.test.ts — we drive the
// pure `stake`/`pruneJuror` facades through stub seams. The shape stub below
// mirrors adapter.ts `buildPruneJuror` verbatim (on-chain PruneJuror account
// order + read-only attestation append); the real adapter wiring is exercised
// end-to-end against the validator.
//
// Excluded from the build; run via: pnpm --filter @useaccord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pruneJuror,
  stake as buildStakeIx,
  type AccordStakingClient,
  type PruneJurorAccounts,
  type StakingAccounts,
} from "./staking.ts";
import { AccountRole, type Address, type Instruction } from "@solana/kit";

const PROGRAM = "P".repeat(44) as Address;
const ATTESTATION = "A".repeat(44) as Address;

const PRUNE_ACCOUNTS: PruneJurorAccounts = {
  caller: "C".repeat(44) as Address,
  juror: "J".repeat(44) as Address,
  subaccord: "S".repeat(44) as Address,
  jurorStake: "JS".repeat(22) as Address,
};

const STAKE_ACCOUNTS: StakingAccounts = {
  juror: "J".repeat(44) as Address,
  subaccord: "S".repeat(44) as Address,
  pauseState: "PZ".repeat(22) as Address,
  jurorStake: "JS".repeat(22) as Address,
  stakingToken: "T".repeat(44) as Address,
  jurorTokenAccount: "JT".repeat(22) as Address,
  stakeVault: "SV".repeat(22) as Address,
};

/** A recording seam: captures the input each builder was called with. */
function recordingClient(): {
  seen: {
    prune?: { accounts: PruneJurorAccounts; attestation: Address };
    stakeAttestation?: Address;
  };
  client: AccordStakingClient;
} {
  const seen: {
    prune?: { accounts: PruneJurorAccounts; attestation: Address };
    stakeAttestation?: Address;
  } = {};
  const I = {} as Instruction;
  return {
    seen,
    client: {
      buildStake: (i: { attestation?: Address }) => (
        (seen.stakeAttestation = i.attestation), I
      ),
      buildPruneJuror: (i: {
        accounts: PruneJurorAccounts;
        attestation: Address;
      }) => (
        (seen.prune = { accounts: i.accounts, attestation: i.attestation }), I
      ),
      buildRequestWithdraw: () => I,
      buildWithdraw: () => I,
      buildReconcileStake: () => I,
      fetchJurorStake: async () => null,
      buildWithdrawFees: () => I,
    } as AccordStakingClient,
  };
}

test("pruneJuror: throws PruneJurorMissingAttestation when attestation is empty", () => {
  const { client } = recordingClient();
  assert.throws(
    () => pruneJuror(client, PROGRAM, PRUNE_ACCOUNTS, [], "" as Address),
    /PruneJurorMissingAttestation/,
  );
});

test("pruneJuror: threads accounts + attestation into buildPruneJuror (path before attestation)", () => {
  const { seen, client } = recordingClient();
  pruneJuror(client, PROGRAM, PRUNE_ACCOUNTS, [], ATTESTATION);
  assert.deepEqual(seen.prune!.accounts, PRUNE_ACCOUNTS);
  assert.equal(seen.prune!.attestation, ATTESTATION);
});

test("stake: omits attestation by default (stake-only Subaccords keep today's behavior)", () => {
  const { seen, client } = recordingClient();
  buildStakeIx(client, PROGRAM, STAKE_ACCOUNTS, 1_000n, []);
  assert.equal(seen.stakeAttestation, undefined);
});

test("stake: forwards attestation on credential-gated Subaccords (6th positional arg)", () => {
  const { seen, client } = recordingClient();
  buildStakeIx(client, PROGRAM, STAKE_ACCOUNTS, 1_000n, [], ATTESTATION);
  assert.equal(seen.stakeAttestation, ATTESTATION);
});

// --- instruction-shape contract: mirrors adapter.ts buildPruneJuror ----------
// The on-chain `PruneJuror` struct orders accounts caller(signer) →
// juror(readonly) → subaccord(writable) → jurorStake(writable) →
// systemProgram(readonly); the expired juror's SAS attestation is appended as
// remaining_accounts[0] (read-only).

/** A seam that builds a real instruction mirroring adapter.ts buildPruneJuror. */
function shapeClient(): AccordStakingClient {
  const I = {} as Instruction;
  return {
    buildPruneJuror: (input: {
      accounts: PruneJurorAccounts;
      attestation: Address;
    }) =>
      Object.freeze({
        programAddress: PROGRAM,
        data: new Uint8Array(),
        accounts: Object.freeze([
          { address: input.accounts.caller, role: AccountRole.WRITABLE_SIGNER },
          { address: input.accounts.juror, role: AccountRole.READONLY },
          { address: input.accounts.subaccord, role: AccountRole.WRITABLE },
          { address: input.accounts.jurorStake, role: AccountRole.WRITABLE },
          {
            address: "11111111111111111111111111111111" as Address,
            role: AccountRole.READONLY,
          },
          { address: input.attestation, role: AccountRole.READONLY },
        ]),
      }) as unknown as Instruction,
    buildStake: () => I,
    buildRequestWithdraw: () => I,
    buildWithdraw: () => I,
    buildReconcileStake: () => I,
    fetchJurorStake: async () => null,
    buildWithdrawFees: () => I,
  } as AccordStakingClient;
}

type Meta = { address: Address; role: number };
const metas = (ix: Instruction): Meta[] =>
  (ix as Instruction & { accounts: Meta[] }).accounts;

test("pruneJuror instruction: caller/juror/subaccord/jurorStake are the first four accounts", () => {
  const accts = metas(
    pruneJuror(shapeClient(), PROGRAM, PRUNE_ACCOUNTS, [], ATTESTATION),
  );
  assert.equal(accts.length, 6, "5 fixed PruneJuror accounts + 1 remaining attestation");
  assert.equal(accts[0]!.address, PRUNE_ACCOUNTS.caller);
  assert.equal(accts[0]!.role, AccountRole.WRITABLE_SIGNER, "caller is the signer");
  assert.equal(accts[1]!.address, PRUNE_ACCOUNTS.juror);
  assert.equal(accts[1]!.role, AccountRole.READONLY, "juror is read-only (NOT a signer)");
  assert.equal(accts[2]!.address, PRUNE_ACCOUNTS.subaccord);
  assert.equal(accts[2]!.role, AccountRole.WRITABLE);
  assert.equal(accts[3]!.address, PRUNE_ACCOUNTS.jurorStake);
  assert.equal(accts[3]!.role, AccountRole.WRITABLE);
});

test("pruneJuror instruction: attestation is remaining_accounts[0], read-only", () => {
  const accts = metas(
    pruneJuror(shapeClient(), PROGRAM, PRUNE_ACCOUNTS, [], ATTESTATION),
  );
  const attestation = accts[5]!;
  assert.equal(attestation.address, ATTESTATION);
  assert.equal(attestation.role, AccountRole.READONLY, "attestation is read-only");
});
