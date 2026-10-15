/**
 * events.test.ts — event-subscriber unit suite (bean accord-vp5r AC: "unit
 * tests decode real-shaped logs; malformed log swallowed+logged").
 *
 * Fixtures are REAL log shapes: `Program data: <base64(discriminator ‖ borsh)>`
 * built with Kit encoders over the exact on-chain layouts (programs/accord
 * events.rs), so a program-side layout change breaks these tests loudly.
 */

import { describe, expect, test } from "bun:test";
import { getBase64Decoder, type Address } from "@solana/kit";

import {
  dispatchAccordEvent,
  parseAccordLog,
  parseAccordLogs,
  type AccordEvent,
  type AccordEventHandlers,
} from "./events.js";

const addr = (tail: string): Address => ("1".repeat(31) + tail) as Address;

const JUROR = addr("2");
const CREATOR = addr("3");
const SUBACCORD = addr("4");
const STAKING_TOKEN = addr("5");
const FEE_TOKEN = addr("6");
const DISPUTE = addr("7");

const base64 = getBase64Decoder();

/** discriminator ‖ borsh payload, base64-encoded as the runtime sees it. */
function eventRecord(discrim: readonly number[], payload: Uint8Array): string {
  return base64.decode(new Uint8Array([...discrim, ...payload]));
}

// Hand-built borsh: every fixture address is `"1".repeat(31) + tail` — 31
// zero bytes + the base58 value of `tail` as the last byte — so payloads are
// plain byte concatenation (LE u32s, u8). The production decoders in
// events.ts still parse these through Kit codecs, so layout stays pinned.

function pubkeyBytes(addr: Address): Uint8Array {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const out = new Uint8Array(32);
  out[31] = alphabet.indexOf(addr[31]!);
  return out;
}

function u32le(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
}

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const DOMAIN_REF = new Uint8Array(32).fill(0xab);

function subaccordCreatedRecord(): string {
  return eventRecord(
    [0xcd, 0x6d, 0x5f, 0x9a, 0x89, 0x80, 0x6f, 0x55],
    concat(
      pubkeyBytes(CREATOR),
      pubkeyBytes(SUBACCORD),
      pubkeyBytes(STAKING_TOKEN),
      pubkeyBytes(FEE_TOKEN),
      DOMAIN_REF,
    ),
  );
}

function seatDrawnRecord(juror: Address = JUROR): string {
  return eventRecord(
    [0x6e, 0x3d, 0x2f, 0x28, 0x0c, 0xdd, 0xdd, 0x7a],
    concat(pubkeyBytes(DISPUTE), u32le(0), u32le(2), pubkeyBytes(juror)),
  );
}

function redrawnRecord(): string {
  return eventRecord(
    [0x45, 0x5d, 0x7a, 0x1d, 0x20, 0x60, 0xdc, 0xd1],
    concat(pubkeyBytes(DISPUTE), u32le(1), u32le(3)),
  );
}

function disputeCreatedRecord(): string {
  return eventRecord(
    [0xfe, 0xca, 0x33, 0x7b, 0x64, 0x98, 0x89, 0x5d],
    concat(pubkeyBytes(DISPUTE), pubkeyBytes(SUBACCORD), pubkeyBytes(CREATOR), new Uint8Array([3])),
  );
}

// --- parse: real-shaped log lines --------------------------------------------

describe("parseAccordLog", () => {
  test("decodes a SubaccordCreated log line", () => {
    const ev = parseAccordLog(`Program data: ${subaccordCreatedRecord()}`);
    expect(ev).toEqual({
      kind: "SubaccordCreated",
      creator: CREATOR,
      subaccord: SUBACCORD,
      stakingToken: STAKING_TOKEN,
      feeToken: FEE_TOKEN,
      domainRef: DOMAIN_REF,
    });
  });
  test("decodes a SeatDrawn log line", () => {
    const drawn = parseAccordLog(`Program data: ${seatDrawnRecord()}`);
    expect(drawn).toEqual({
      kind: "SeatDrawn",
      dispute: DISPUTE,
      roundIdx: 0,
      seat: 2,
      juror: JUROR,
    });
  });

  test("decodes a Redrawn log line", () => {
    const ev = parseAccordLog(`Program data: ${redrawnRecord()}`);
    expect(ev).toEqual({
      kind: "Redrawn",
      dispute: DISPUTE,
      roundIdx: 1,
      drawAttempt: 3,
    });
  });

  test("decodes a DisputeCreated log line", () => {
    const ev = parseAccordLog(`Program data: ${disputeCreatedRecord()}`);
    expect(ev).toEqual({
      kind: "DisputeCreated",
      dispute: DISPUTE,
      subaccord: SUBACCORD,
      filer: CREATOR,
      numOptions: 3,
    });
  });

  test("ignores non-event log lines", () => {
    expect(parseAccordLog("Program log: invoke cordhVos…")).toBeNull();
    expect(parseAccordLog("Program consumption: 12345 units")).toBeNull();
    expect(parseAccordLog("")).toBeNull();
  });

  test("swallows malformed base64 (returns null, never throws)", () => {
    expect(parseAccordLog("Program data: !!!not-base64!!!")).toBeNull();
  });

  test("swallows a record with an unknown discriminator", () => {
    const unknown = eventRecord(
      [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07],
      new Uint8Array([1, 2, 3]),
    );
    expect(parseAccordLog(`Program data: ${unknown}`)).toBeNull();
  });

  test("swallows a truncated payload under a known discriminator", () => {
    // DisputeCreated discriminator + only 5 bytes of a 97-byte body.
    const truncated = base64.decode(
      new Uint8Array([0xfe, 0xca, 0x33, 0x7b, 0x64, 0x98, 0x89, 0x5d, 1, 2, 3, 4, 5]),
    );
    expect(parseAccordLog(`Program data: ${truncated}`)).toBeNull();
  });
});

// --- parse: full log sets ------------------------------------------------------

describe("parseAccordLogs", () => {
  test("yields every embedded event in log order", () => {
    const logs = [
      "Program log: Instruction: DrawSeat",
      `Program data: ${seatDrawnRecord(addr("8"))}`,
      "Program log: Program consumed 5000 of 200000 units",
      `Program data: ${subaccordCreatedRecord()}`,
      `Program data: ${redrawnRecord()}`,
    ];
    const events = parseAccordLogs(logs);
    expect(events.map((e) => e.kind)).toEqual(["SeatDrawn", "SubaccordCreated", "Redrawn"]);
  });

  test("an empty or eventless log set yields nothing", () => {
    expect(parseAccordLogs([])).toEqual([]);
    expect(parseAccordLogs(["Program log: nothing here"])).toEqual([]);
  });
});

// --- dispatch: best-effort handlers --------------------------------------------

describe("dispatchAccordEvent", () => {
  test("routes each kind to its handler", () => {
    const seen: string[] = [];
    const handlers: AccordEventHandlers = {
      onSubaccordCreated: (e) => seen.push(`sub:${e.subaccord}`),
      onSeatDrawn: (e) => seen.push(`seat:${e.juror}:${e.seat}`),
      onRedrawn: (e) => seen.push(`redraw:${e.roundIdx}`),
      onDisputeCreated: (e) => seen.push(`dispute:${e.dispute}`),
    };
    for (const record of [
      subaccordCreatedRecord(),
      seatDrawnRecord(),
      redrawnRecord(),
      disputeCreatedRecord(),
    ]) {
      const ev = parseAccordLog(`Program data: ${record}`) as AccordEvent;
      dispatchAccordEvent(handlers, ev, record);
    }
    expect(seen).toEqual([`sub:${SUBACCORD}`, `seat:${JUROR}:2`, "redraw:1", `dispute:${DISPUTE}`]);
  });

  test("a throwing handler is swallowed and surfaced via onError", () => {
    const errors: unknown[] = [];
    let survived = false;
    const handlers: AccordEventHandlers = {
      onSeatDrawn: () => {
        throw new Error("handler bug");
      },
      onDisputeCreated: () => {
        survived = true;
      },
      onError: (err) => errors.push(err),
    };
    const seat = parseAccordLog(`Program data: ${seatDrawnRecord()}`) as AccordEvent;
    expect(() => dispatchAccordEvent(handlers, seat, "raw")).not.toThrow();
    expect(errors).toHaveLength(1);

    const dispute = parseAccordLog(`Program data: ${disputeCreatedRecord()}`) as AccordEvent;
    dispatchAccordEvent(handlers, dispute, "raw");
    expect(survived).toBe(true);
  });
});
