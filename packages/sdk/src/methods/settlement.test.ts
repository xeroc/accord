// settlement.test.ts — layout tests for deriveCancelDisputeRemainingAccounts
// (bean accord-br6a). The on-chain cancel_dispute handler enforces STRICT
// accounting over remainingAccounts (current Round + panel, every prior
// Round + panel, then one AppealBond per appeal — nothing more, nothing
// contract independently, so the derivation lives in the SDK as the single
// source; these tests pin it to the on-chain layout. Round accounts are
// served by a stubbed getAccountInfo — no chain.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  address,
  getBase64Decoder,
  type Address,
  type GetAccountInfoApi,
  type Rpc,
} from "@solana/kit";
import { findAppealBondPda, findJurorStakePda, findRoundPda } from "../pda.ts";
import { getRoundEncoder, type RoundArgs } from "../generated/accounts/round.ts";
import { deriveCancelDisputeRemainingAccounts } from "./settlement.ts";

const PROGRAM = address("cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed");
const DISPUTE = address("Dispute111111111111111111111111111111111111");
const SUBACCORD = address("Subacrd111111111111111111111111111111111111");
const SYSTEM = "11111111111111111111111111111111";
const Z32 = new Uint8Array(32);
const J0 = address("Dispute111111111111111111111111111111111112");
const J1 = address("Dispute111111111111111111111111111111111113");
const J2 = address("Dispute111111111111111111111111111111111114");
const J3 = address("Dispute111111111111111111111111111111111115");
const J4 = address("Dispute111111111111111111111111111111111116");

/** A stubbed RPC serving encoded Round accounts by round index. */
async function rpcWithRounds(
  rounds: Record<number, Address[]>,
): Promise<Rpc<GetAccountInfoApi>> {
  const accounts = new Map<string, unknown>();
  for (const [idx, jurors] of Object.entries(rounds)) {
    const [pda] = await findRoundPda(
      { dispute: DISPUTE, roundIdx: Number(idx) },
      { programAddress: PROGRAM },
    );
    accounts.set(pda.toString(), roundAccount(jurors));
  }
  return {
    getAccountInfo: (a: Address) => ({
      send: async () => ({
        context: { slot: 0n },
        value: accounts.get(a.toString()) ?? null,
      }),
    }),
  } as unknown as Rpc<GetAccountInfoApi>;
}

function roundAccount(jurors: Address[]): unknown {
  const panel = [...jurors, ...new Array(31 - jurors.length).fill(address(SYSTEM))];
  const args: RoundArgs = {
    roundIdx: 0,
    jurorCount: jurors.length,
    commitCount: 0,
    revealCount: 0,
    drawAttempt: 0,
    settled: 0,
    bump: 255,
    pad0: new Uint8Array(2),
    reviewEnd: 0n,
    commitEnd: 0n,
    revealEnd: 0n,
    result: 0n,
    dispute: DISPUTE,
    jurors: panel,
    commits: new Array(31).fill(Z32),
    seatPrefix: new Array(31).fill(0n),
    seatStake: new Array(31).fill(0n),
    reveals: new Array(31).fill(0n),
  };
  const data = getBase64Decoder().decode(getRoundEncoder().encode(args));
  return { data: [data, "base64"], executable: false, lamports: 1n, owner: PROGRAM, rentEpoch: 0n };
}

const roundAddr = (r: number): Promise<Address> =>
  findRoundPda({ dispute: DISPUTE, roundIdx: r }, { programAddress: PROGRAM }).then(([a]) => a);
const bondAddr = (r: number): Promise<Address> =>
  findAppealBondPda({ dispute: DISPUTE, roundIdx: r }, { programAddress: PROGRAM }).then(
    ([a]) => a,
  );
const stakeAddr = (j: Address): Promise<Address> =>
  findJurorStakePda({ subaccord: SUBACCORD, juror: j }, { programAddress: PROGRAM }).then(
    ([a]) => a,
  );
const panel = (jurors: Address[]): Promise<Address[]> => Promise.all(jurors.map(stakeAddr));

test("never-drawn pre-draw stall → EMPTY remaining (the devnet InvalidPanelSize regression)", async () => {
  // Created, currentRound 0, drawnSeats 0: draw_seat never ran, so no Round
  // account exists — on-chain strict accounting requires remainingAccounts [].
  const out = await deriveCancelDisputeRemainingAccounts(
    await rpcWithRounds({}),
    PROGRAM,
    DISPUTE,
    SUBACCORD,
    0,
    0,
  );
  assert.deepEqual(out, []);
});

test("partially-drawn Created → current Round + drawn seats only (sentinels skipped)", async () => {
  const out = await deriveCancelDisputeRemainingAccounts(
    await rpcWithRounds({ 0: [J0, J1] }),
    PROGRAM,
    DISPUTE,
    SUBACCORD,
    0,
    2,
  );
  assert.deepEqual(out, [await roundAddr(0), ...(await panel([J0, J1]))]);
});

test("Created after an appeal (drawnSeats 0) → prior round + panel + bond, NO current-round PDA", async () => {
  // appeal.rs resets state to Created with drawn_seats 0; the new round's
  // PDA does not exist until draw_seat runs, but round 0 + its bond must be
  // released/credited.
  const out = await deriveCancelDisputeRemainingAccounts(
    await rpcWithRounds({ 0: [J0, J1] }),
    PROGRAM,
    DISPUTE,
    SUBACCORD,
    1,
    0,
  );
  assert.deepEqual(out, [
    await roundAddr(0),
    ...(await panel([J0, J1])),
    await bondAddr(0),
  ]);
});

test("post-draw with two appeals → current panel, prior rounds+panels, bonds at seeds 0..currentRound-1", async () => {
  const out = await deriveCancelDisputeRemainingAccounts(
    await rpcWithRounds({ 0: [J0, J1], 1: [J2], 2: [J3, J4] }),
    PROGRAM,
    DISPUTE,
    SUBACCORD,
    2,
    2,
  );
  assert.deepEqual(out, [
    // current round first (on-chain reads remaining_accounts[0])
    await roundAddr(2),
    ...(await panel([J3, J4])),
    // then prior rounds in ascending order (release_prior_rounds)
    await roundAddr(0),
    ...(await panel([J0, J1])),
    await roundAddr(1),
    ...(await panel([J2])),
    // bonds LAST, seeds 0-based (the round BEING appealed — the bond's
    // round_idx FIELD is seed+1; credit_bond_bounty_units expects seeds)
    await bondAddr(0),
    await bondAddr(1),
  ]);
});

test("missing prior Round → throws loudly instead of shipping a wrong-count tx", async () => {
  await assert.rejects(
    deriveCancelDisputeRemainingAccounts(
      await rpcWithRounds({}),
      PROGRAM,
      DISPUTE,
      SUBACCORD,
      1,
      0,
    ),
    /RoundNotFound/,
  );
});
