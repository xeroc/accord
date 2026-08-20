// helpers/accordStub.ts — shared `Accord` stub for the evidence-daemon suite.
//
// WHY THIS EXISTS. Commit acd4e9a migrated the chain reader off the Codama
// client-method API (`accord.client.accord.accounts.X.fetchMaybe`) onto the
// generated standalone fetchers (`fetchMaybeX(accord.rpc, addr)`) — the
// documented correct read path for raw-RPC consumers (SDK index.ts §"Account
// decoders"). A stub that overrides `client...fetchMaybe` no longer intercepts
// anything: the reader reads `accord.rpc` exclusively, so the stub must supply
// an `rpc` whose `getAccountInfo` answers with REAL ENCODED account bytes. The
// generated fetchers decode via the real codec — there is no seam to inject a
// pre-decoded JS object.
//
// This helper builds those bytes with the SDK encoders over default-filled
// accounts, keyed by address, so each test specifies only the fields it
// exercises. The Round is registered under the exact PDA the reader derives
// (`findRoundPda`), so `readRound` resolves it without the test precomputing it.
import { address, getBase64Decoder, type Address } from "@solana/kit";
import {
  ACCORD_PROGRAM_ID,
  Aggregation,
  DisputeState,
  ShortfallPolicy,
  findRoundPda,
  getDisputeEncoder,
  getRoundEncoder,
  getSubaccordEncoder,
} from "@useaccord/sdk";
import { CaseState, getSynodCaseEncoder, SYNOD_PROGRAM_ADDRESS } from "@useaccord/synod";

/** System-program id (32 zero bytes) — the default for unused address fields. */
export const ZERO: Address = address("11111111111111111111111111111111");
const z32 = (): Uint8Array => new Uint8Array(32);

// --- default-filled, encodable accounts ----------------------------------
//     The 8-byte discriminator is injected by each encoder (transformEncoder);
//     do NOT set it here. Fields the daemon never reads are zeroed so the
//     fixture is byte-valid without coupling tests to unrelated schema. Adding
//     a field on-chain later only touches these defaults, never the call sites.

const SUBACCORD_DEFAULT = {
  creator: ZERO,
  stakingToken: ZERO,
  feeToken: ZERO,
  minStake: 0n,
  alphaBps: 0,
  reviewWindow: 0n,
  commitWindow: 0n,
  revealWindow: 0n,
  appealWindow: 0n,
  maxAppeals: 0,
  aggregation: Aggregation.Plurality,
  feePerJuror: 0n,
  revealThresholdBps: 0,
  shortfallPolicy: ShortfallPolicy.Redraw,
  maxDrawAttempts: 0,
  minJurySize: 3,
  authority: ZERO,
  evidenceOperator: ZERO,
  domainRef: z32(),
  evidenceSpec: z32(),
  jurorCredential: ZERO,
  coherenceTolBps: 0,
  jurorSchema: ZERO,
  stakerCount: 0,
  rootHash: z32(),
  totalStake: 0n,
  nextIndex: 0,
  depth: 0,
  feeVaultDeposited: 0n,
  feeVaultWithdrawn: 0n,
  stakeVaultDeposited: 0n,
  stakeVaultWithdrawn: 0n,
  freeHead: 0xffff_ffff, // u32::MAX = free-list empty
  bump: 0,
  padding: new Uint8Array(64),
};

const CASE_TERMS_DEFAULT = {
  alphaBps: 0,
  minStake: 0n,
  feePerJuror: 0n,
  reviewWindow: 0n,
  commitWindow: 0n,
  revealWindow: 0n,
  appealWindow: 0n,
  maxAppeals: 0,
  aggregation: Aggregation.Plurality,
  revealThresholdBps: 0,
  shortfallPolicy: ShortfallPolicy.Redraw,
  maxDrawAttempts: 0,
  minJurySize: 3,
  coherenceTolBps: 0,
};

const DISPUTE_DEFAULT = {
  subaccord: ZERO,
  filer: ZERO,
  nonce: 0n,
  numOptions: 0,
  options: Array.from({ length: 8 }, z32),
  evidenceHashes: Array.from({ length: 4 }, z32),
  state: DisputeState.Created,
  currentRound: 0,
  terms: CASE_TERMS_DEFAULT,
  finalRuling: 0,
  finalizedAt: 0n,
  feePaid: 0n,
  committedVrf: null, // Option<32>::None
  frozenRoot: z32(),
  frozenTotalStake: 0n,
  filedAt: 0n,
  bump: 0,
  padding: new Uint8Array(64),
};

const ROUND_DEFAULT = {
  roundIdx: 0,
  jurorCount: 0,
  commitCount: 0,
  revealCount: 0,
  drawAttempt: 0,
  settled: 0,
  bump: 0,
  pad0: new Uint8Array(2),
  reviewEnd: 0n,
  commitEnd: 0n,
  revealEnd: 0n,
  result: 0xffff_ffff_ffff_ffffn, // u64::MAX = not set
  dispute: ZERO,
  jurors: Array.from({ length: 31 }, (): Address => ZERO),
  commits: Array.from({ length: 31 }, z32),
  seatPrefix: Array.from({ length: 31 }, () => 0n),
  seatStake: Array.from({ length: 31 }, () => 0n),
  reveals: Array.from({ length: 31 }, () => 0xffff_ffff_ffff_ffffn), // u64::MAX = not revealed
};

export type SubaccordStubData = Partial<typeof SUBACCORD_DEFAULT>;
export type DisputeStubData = Partial<typeof DISPUTE_DEFAULT>;
export type RoundStubData = Partial<typeof ROUND_DEFAULT>;

/** Default SynodCase: 2-party Opening case, unbound dispute (accord-g1dy). */
const SYNOD_CASE_DEFAULT = {
  subaccord: ZERO,
  parties: Array.from({ length: 7 }, (): Address => ZERO),
  partyCount: 2,
  joined: 0,
  stake: 0n,
  fee: 0n,
  joinDeadline: 0n,
  evidence: Array.from({ length: 7 }, z32),
  dispute: ZERO, // Pubkey::default sentinel — dispute not yet filed
  paidOut: 0,
  state: CaseState.Opening,
  bump: 0,
};

export type SynodCaseStubData = Partial<typeof SYNOD_CASE_DEFAULT>;

export interface AccordStubRegs {
  /** Registered at `address`; fetched by `readSubaccord`. */
  subaccord?: { address: Address; data?: SubaccordStubData } | null;
  /** Registered at `address`; fetched by `readDispute`. */
  dispute?: { address: Address; data?: DisputeStubData } | null;
  /** Registered at `findRoundPda({dispute, roundIdx})`; fetched by `readRound`. */
  round?: { dispute: Address; roundIdx: number; data?: RoundStubData } | null;
  /** Registered at `address` with the SYNOD program owner; fetched by `readSynodCase`. */
  synodCase?: { address: Address; data?: SynodCaseStubData } | null;
}

/** Pad/truncate a jurors list to the Round's fixed size of 31 (zero-pubkey fill). */
function fixJurors(jurors: readonly Address[]): Address[] {
  const out: Address[] = Array.from({ length: 31 }, (): Address => ZERO);
  for (let i = 0; i < Math.min(jurors.length, 31); i++) out[i] = jurors[i];
  return out;
}

/**
 * Build an `Accord` whose `.rpc.getAccountInfo(addr).send()` resolves to the
 * registered encoded account, or `{ value: null }` for any unregistered address
 * (the reader maps that to a `null` view). Only `.rpc` is wired — it is the
 * sole field the chain reader touches.
 */
export async function stubAccord(regs: AccordStubRegs): Promise<Accord> {
  const toBase64 = getBase64Decoder();
  const byAddr = new Map<Address, { value: unknown }>();

  const register = (addr: Address, bytes: Uint8Array, owner: Address = ACCORD_PROGRAM_ID): void => {
    byAddr.set(addr, {
      value: {
        data: [toBase64.decode(bytes), "base64"],
        executable: false,
        lamports: 1,
        owner,
        space: bytes.length,
      },
    });
  };

  if (regs.subaccord) {
    register(
      regs.subaccord.address,
      getSubaccordEncoder().encode({ ...SUBACCORD_DEFAULT, ...regs.subaccord.data }),
    );
  }
  if (regs.dispute) {
    register(
      regs.dispute.address,
      getDisputeEncoder().encode({ ...DISPUTE_DEFAULT, ...regs.dispute.data }),
    );
  }
  if (regs.round) {
    const { dispute, roundIdx, data } = regs.round;
    // Register under the exact PDA the reader derives from (dispute, roundIdx).
    const [pda] = await findRoundPda({ dispute, roundIdx });
    const merged = {
      ...ROUND_DEFAULT,
      ...data,
      dispute,
      roundIdx,
      ...(data?.jurors ? { jurors: fixJurors(data.jurors) } : {}),
    };
    register(pda, getRoundEncoder().encode(merged));
  }
  if (regs.synodCase) {
    register(
      regs.synodCase.address,
      getSynodCaseEncoder().encode({ ...SYNOD_CASE_DEFAULT, ...regs.synodCase.data }),
      SYNOD_PROGRAM_ADDRESS,
    );
  }

  const nullResp = { value: null };
  const rpc = {
    getAccountInfo: (addr: Address) => ({
      send: async () => byAddr.get(addr) ?? nullResp,
    }),
  };
  return { rpc } as unknown as Accord;
}
