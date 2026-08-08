// events.test.ts — chain/events.ts decoder round-trips + subscription dispatch.
//
// Runs under Bun (daemon is a Bun app; SPEC.md). The pure decoders
// (decodeAccordEvent / parseAccordLog) are covered here along with the
// subscription path (subscribeAccordEvents) — the latter via a stub
// RpcSubscriptions whose logsNotifications stream yields controlled
// notifications. Verifies the bean contract: "events fire on expected
// transitions" and a thrown handler can't kill the loop.
import { test, expect } from "bun:test";
import {
  getBase58Encoder,
  getU32Encoder,
  type Address,
  type RpcSubscriptions,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";
import {
  decodeAccordEvent,
  parseAccordLog,
  parseAccordLogs,
  subscribeAccordEvents,
  type AccordEvent,
  type AccordEventHandlers,
} from "../src/chain/events.ts";

// --- synthetic Anchor event builders (discriminator ++ borsh payload) -------

const b58 = getBase58Encoder();
const u32 = getU32Encoder();
const SYS: Address = "11111111111111111111111111111112";
const TOK: Address = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const RENT: Address = "SysvarRent111111111111111111111111111111111";

// sha256("event:<Name>")[0..8] — mirrors events.ts.
const DC = new Uint8Array([0xfe, 0xca, 0x33, 0x7b, 0x64, 0x98, 0x89, 0x5d]);
const JD = new Uint8Array([0x98, 0x69, 0x4a, 0xe2, 0xb5, 0xde, 0x89, 0x41]);
const RF = new Uint8Array([0xbf, 0x58, 0xc2, 0x3f, 0x8e, 0x29, 0xa8, 0x46]);

function cat(...parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
const b = (a: Address) => b58.encode(a);

function disputeCreatedRecord(): Uint8Array {
  return cat(DC, b(SYS), b(TOK), b(RENT), new Uint8Array([7]));
}
function jurorsDrawnRecord(): Uint8Array {
  return cat(
    JD,
    b(SYS),
    u32.encode(3), // roundIdx
    u32.encode(2), // Vec len
    b(SYS),
    b(TOK),
    b(RENT), // 32-byte VRF seed stand-in
  );
}
function rulingFinalizedRecord(): Uint8Array {
  return cat(RF, b(SYS), new Uint8Array([1]));
}
function programData(record: Uint8Array): string {
  return `Program data: ${Buffer.from(record).toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Pure decoders.
// ---------------------------------------------------------------------------

test("decodeAccordEvent: DisputeCreated round-trips", () => {
  const ev = decodeAccordEvent(disputeCreatedRecord())!;
  expect(ev.kind).toBe("DisputeCreated");
  const dc = ev as Extract<AccordEvent, { kind: "DisputeCreated" }>;
  expect(dc.dispute).toBe(SYS);
  expect(dc.subaccord).toBe(TOK);
  expect(dc.filer).toBe(RENT);
  expect(dc.numOptions).toBe(7);
});

test("decodeAccordEvent: JurorsDrawn round-trips jurors vec + seed", () => {
  const ev = decodeAccordEvent(jurorsDrawnRecord())!;
  expect(ev.kind).toBe("JurorsDrawn");
  const jd = ev as Extract<AccordEvent, { kind: "JurorsDrawn" }>;
  expect(jd.dispute).toBe(SYS);
  expect(jd.roundIdx).toBe(3);
  expect(jd.jurors).toEqual([SYS, TOK]);
  expect(jd.vrfSeed.length).toBe(32);
});

test("decodeAccordEvent: RulingFinalized round-trips", () => {
  const ev = decodeAccordEvent(rulingFinalizedRecord())!;
  expect(ev.kind).toBe("RulingFinalized");
  const rf = ev as Extract<AccordEvent, { kind: "RulingFinalized" }>;
  expect(rf.dispute).toBe(SYS);
  expect(rf.ruling).toBe(1);
});

test("decodeAccordEvent: unknown / short / malformed → null, never throws", () => {
  const unknown = cat(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), b(SYS));
  expect(decodeAccordEvent(unknown)).toBeNull();
  expect(decodeAccordEvent(new Uint8Array(3))).toBeNull();
  // Valid discriminator but truncated payload.
  expect(decodeAccordEvent(cat(JD, b(SYS)))).toBeNull();
});

test("parseAccordLog: extracts events; ignores noise + bad base64", () => {
  expect(parseAccordLog(programData(rulingFinalizedRecord()))!.kind).toBe("RulingFinalized");
  expect(parseAccordLog("Program log: noise")).toBeNull();
  expect(parseAccordLog("Program data: !!!not-base64!!!")).toBeNull();
  expect(parseAccordLogs(["a", programData(disputeCreatedRecord()), "b"])).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// subscribeAccordEvents — events fire on expected transitions, and the loop is
// resilient. The stub streams a fixed list of notifications then ends.
// ---------------------------------------------------------------------------

/** A stub RpcSubscriptions that yields `logs` batches as notifications. */
function stubSubscriptions(
  batches: readonly (readonly string[])[],
): RpcSubscriptions<SolanaRpcSubscriptionsApi> {
  return {
    logsNotifications: () => ({
      subscribe: async () => {
        const queue = batches.map((logs) => ({
          value: { logs, err: null, signature: "sig" },
        }));
        return {
          [Symbol.asyncIterator]() {
            let i = 0;
            return {
              next(): Promise<IteratorResult<(typeof queue)[number]>> {
                if (i < queue.length) {
                  return Promise.resolve({ value: queue[i++], done: false });
                }
                return Promise.resolve({ value: undefined, done: true });
              },
            };
          },
        };
      },
    }),
  } as unknown as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
}

/** Collect every event a handler sees, until the subscription resolves. */
async function drain(
  batches: readonly (readonly string[])[],
  handlers: AccordEventHandlers,
): Promise<void> {
  const ac = new AbortController();
  await subscribeAccordEvents(stubSubscriptions(batches), SYS, handlers, ac.signal);
}

test("subscribe: DisputeCreated fires on the indexing wake-up", async () => {
  const seen: AccordEvent[] = [];
  await drain([[programData(disputeCreatedRecord())]], {
    onDisputeCreated: (e) => seen.push(e),
  });
  expect(seen).toHaveLength(1);
  expect(seen[0].kind).toBe("DisputeCreated");
});

test("subscribe: JurorsDrawn fires the deliverability cache hint", async () => {
  const seen: AccordEvent[] = [];
  await drain([[programData(jurorsDrawnRecord())]], {
    onJurorsDrawn: (e) => seen.push(e),
  });
  expect(seen).toHaveLength(1);
  const jd = seen[0] as Extract<AccordEvent, { kind: "JurorsDrawn" }>;
  expect(jd.roundIdx).toBe(3);
  expect(jd.jurors).toEqual([SYS, TOK]);
});

test("subscribe: RulingFinalized fires the retention trigger", async () => {
  const seen: AccordEvent[] = [];
  await drain([[programData(rulingFinalizedRecord())]], {
    onRulingFinalized: (e) => seen.push(e),
  });
  expect(seen).toHaveLength(1);
  expect(seen[0].kind).toBe("RulingFinalized");
});

test("subscribe: non-Accord log noise fires nothing", async () => {
  const seen: AccordEvent[] = [];
  await drain([["Program log: x", "Program invoke [1]", "Program data: AAAAAA="]], {
    onDisputeCreated: (e) => seen.push(e),
  });
  expect(seen).toHaveLength(0);
});

test("subscribe: multiple events in one transaction fire in order", async () => {
  const seen: AccordEvent[] = [];
  await drain([[programData(disputeCreatedRecord()), programData(jurorsDrawnRecord())]], {
    onDisputeCreated: (e) => seen.push(e),
    onJurorsDrawn: (e) => seen.push(e),
  });
  expect(seen.map((e) => e.kind)).toEqual(["DisputeCreated", "JurorsDrawn"]);
});

test("subscribe: a thrown handler is reported via onError, loop continues", async () => {
  const seen: AccordEvent[] = [];
  let errors = 0;
  let thrown = false;
  await drain(
    [
      [programData(rulingFinalizedRecord())], // first: handler throws
      [programData(rulingFinalizedRecord())], // second: must still fire
    ],
    {
      onRulingFinalized: (e) => {
        if (!thrown) {
          thrown = true;
          throw new Error("boom");
        }
        seen.push(e);
      },
      onError: () => {
        errors++;
      },
    },
  );
  expect(errors).toBe(1);
  expect(seen).toHaveLength(1);
});
