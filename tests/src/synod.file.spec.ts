// synod.file.spec.ts — `file_dispute` against Surfpool
// (port of programs/synod/tests/file_dispute_litesvm.rs, CPI edition).
//
// Coverage (milestone accord-oylq HANDOFF §6):
//  - happy file on a full roster: dispute PDA bound (["dispute", case, 0]),
//    filer = case PDA, options are the deterministic labels (party i →
//    option i, neutral at index N), evidence_hashes[0] = H(case ‖ e_0..e_{N-1}),
//    vault = N·S − fee, case state → Live
//  - 7-party case: options len == 8 (7 parties + neutral)
//  - gates: incomplete roster (RosterIncomplete), double file (NotOpening),
//    join after Live (NotOpening)

import { getDisputeDecoder } from "@useaccord/sdk";
import { CaseState } from "@useaccord/synod";

import { createTestEnv, type TestEnv } from "./setup/env.js";
import { ataOf } from "./setup/tokens.js";
import { synodEvidenceHash, synodOptionLabel } from "./setup/fixtures.js";
import { fetchDecoded } from "./setup/assertions.js";
import {
  armSynodCourt,
  fileSynodDispute,
  joinSynodParty,
  openFullRoster,
  openSynodCase,
  readSynodCase,
  SY_STAKE,
  tokenAmount,
  type SynodArm,
} from "./synod-harness.js";

describe("e2e: synod file_dispute (requires Surfpool)", () => {
  let env: TestEnv;
  let arm!: SynodArm;

  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return;
    arm = await armSynodCourt(env);
  }, 180_000);

  it("files on a full roster: CPI dispute bound, vault = N·S − fee, Live", async () => {
    if (!env.up) return;
    const fx = await openFullRoster(arm, 3);
    const vault = await ataOf(arm.mint, fx.casePda);
    expect(await tokenAmount(env, vault)).toBe(3n * SY_STAKE);

    const dispute = await fileSynodDispute(fx);

    // Case: dispute bound to the canonical PDA, state Live.
    const c = (await readSynodCase(env, fx.casePda))!;
    expect(c.dispute).toBe(dispute);
    expect(c.state).toBe(CaseState.Live);

    // Vault paid the frozen fee into the Subaccord fee_vault.
    expect(await tokenAmount(env, vault)).toBe(3n * SY_STAKE - arm.frozenFee);

    // Dispute: case PDA is the filer, deterministic options + evidence root.
    const d = (await fetchDecoded(env, dispute, getDisputeDecoder()))!;
    expect(d.filer).toBe(fx.casePda);
    expect(d.nonce).toBe(0n);
    expect(d.numOptions).toBe(4); // 3 parties + neutral
    const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
    for (let i = 0; i <= 3; i++) {
      expect(hex(new Uint8Array(d.options[i]!))).toBe(
        hex(synodOptionLabel(fx.casePda, i)),
      );
    }

    // evidence_hashes[0] = H(case_pda ‖ e_0 ‖ e_1 ‖ e_2) in naming order.
    const c2 = (await readSynodCase(env, fx.casePda))!;
    expect(hex(new Uint8Array(d.evidenceHashes[0]!))).toBe(
      hex(synodEvidenceHash(fx.casePda, c2.evidence.slice(0, 3).map((e) => new Uint8Array(e)))),
    );
  });

  it("files a 7-party case with 8 options", async () => {
    if (!env.up) return;
    const fx = await openFullRoster(arm, 7);
    const dispute = await fileSynodDispute(fx);
    const d = (await fetchDecoded(env, dispute, getDisputeDecoder()))!;
    expect(d.numOptions).toBe(8);
    expect(d.options).toHaveLength(8);
  });

  it("rejects filing an incomplete roster (RosterIncomplete)", async () => {
    if (!env.up) return;
    const fx = await openSynodCase(arm, 3);
    await joinSynodParty(fx, fx.parties[0]!);
    await joinSynodParty(fx, fx.parties[1]!);
    // Party 2 never joins → full-roster gate fails.
    await expect(fileSynodDispute(fx)).rejects.toThrow();
  });

  it("rejects a double file (NotOpening)", async () => {
    if (!env.up) return;
    const fx = await openFullRoster(arm, 2);
    await fileSynodDispute(fx);
    await expect(fileSynodDispute(fx)).rejects.toThrow();
  });

  it("rejects a join after the case went Live (NotOpening)", async () => {
    if (!env.up) return;
    const fx = await openFullRoster(arm, 2);
    await fileSynodDispute(fx);
    // Every party already joined; a re-join hits the state gate first.
    await expect(joinSynodParty(fx, fx.parties[1]!)).rejects.toThrow();
  });
});
