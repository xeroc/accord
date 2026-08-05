// events.selfcheck.ts — runnable self-check for chain/events.ts decoders.
//
// Excluded from the tsc build (lives outside `src/`); run directly via Node's
// native TS type-stripping:
//
//   node --test apps/evidence-daemon/tests/events.selfcheck.ts
//
// Covers the non-trivial logic: Anchor discriminator dispatch + borsh struct
// decode for the three tracked events, the `Program data:` log-line parser,
// and the "cache hint, never throws" contract. The websocket subscription
// path is I/O and belongs to the e2e Surfpool suite (milestone accord-yjno DoD).
//
// ponytail: ONE runnable check for the parser — no framework config, no
// fixtures; synthetic events are built inline with the same Kit codecs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getBase58Encoder, getU32Encoder, type Address } from "@solana/kit";
import {
  decodeAccordEvent,
  parseAccordLog,
  parseAccordLogs,
  type AccordEvent,
} from "../src/chain/events.ts";

const b58 = getBase58Encoder();
const u32 = getU32Encoder();

// Discriminators (sha256("event:<Name>")[0..8]) — must mirror events.ts.
const DC = new Uint8Array([0xfe, 0xca, 0x33, 0x7b, 0x64, 0x98, 0x89, 0x5d]);
const JD = new Uint8Array([0x98, 0x69, 0x4a, 0xe2, 0xb5, 0xde, 0x89, 0x41]);
const RF = new Uint8Array([0xbf, 0x58, 0xc2, 0x3f, 0x8e, 0x29, 0xa8, 0x46]);

const SYS: Address = "11111111111111111111111111111112";
const TOK: Address = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const RENT: Address = "SysvarRent111111111111111111111111111111111";

function addrBytes(a: Address): Uint8Array {
  return b58.encode(a);
}

/** Concatenate Uint8Arrays into one. */
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

function buildDisputeCreated(): Uint8Array {
  const payload = cat(
    addrBytes(SYS),
    addrBytes(TOK),
    addrBytes(RENT),
    new Uint8Array([7]), // numOptions
  );
  return cat(DC, payload);
}

function buildJurorsDrawn(): Uint8Array {
  // dispute(32) ++ roundIdx(u32 LE) ++ Vec count(u32 LE)=2 ++ juror1 ++ juror2 ++ vrfSeed(32)
  const payload = cat(
    addrBytes(SYS),
    u32.encode(3),
    u32.encode(2),
    addrBytes(SYS),
    addrBytes(TOK),
    addrBytes(RENT), // reuses rent bytes as a stand-in 32-byte seed
  );
  return cat(JD, payload);
}

function buildRulingFinalized(): Uint8Array {
  return cat(RF, addrBytes(SYS), new Uint8Array([1]));
}

test("decodeAccordEvent: DisputeCreated round-trips all fields", () => {
  const ev = decodeAccordEvent(buildDisputeCreated())!;
  assert.equal(ev.kind, "DisputeCreated");
  assert.equal((ev as AccordEvent & { dispute: Address }).dispute, SYS);
  assert.equal((ev as AccordEvent & { subaccord: Address }).subaccord, TOK);
  // filer + numOptions present on this kind only
  const dc = ev as Extract<AccordEvent, { kind: "DisputeCreated" }>;
  assert.equal(dc.filer, RENT);
  assert.equal(dc.numOptions, 7);
});

test("decodeAccordEvent: JurorsDrawn round-trips jurors vec + seed", () => {
  const ev = decodeAccordEvent(buildJurorsDrawn())!;
  assert.equal(ev.kind, "JurorsDrawn");
  const jd = ev as Extract<AccordEvent, { kind: "JurorsDrawn" }>;
  assert.equal(jd.dispute, SYS);
  assert.equal(jd.roundIdx, 3);
  assert.deepEqual(jd.jurors, [SYS, TOK]);
  assert.equal(jd.vrfSeed.length, 32);
  assert.deepEqual(Array.from(jd.vrfSeed), Array.from(addrBytes(RENT)));
});

test("decodeAccordEvent: RulingFinalized round-trips", () => {
  const ev = decodeAccordEvent(buildRulingFinalized())!;
  assert.equal(ev.kind, "RulingFinalized");
  const rf = ev as Extract<AccordEvent, { kind: "RulingFinalized" }>;
  assert.equal(rf.dispute, SYS);
  assert.equal(rf.ruling, 1);
});

test("decodeAccordEvent: unknown discriminator → null (no throw)", () => {
  const unknown = cat(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), addrBytes(SYS));
  assert.equal(decodeAccordEvent(unknown), null);
});

test("decodeAccordEvent: too-short record → null (no throw)", () => {
  assert.equal(decodeAccordEvent(new Uint8Array([1, 2, 3])), null);
});

test("decodeAccordEvent: malformed payload → null (no throw)", () => {
  // Valid discriminator, but truncated payload that can't satisfy the struct.
  const bad = cat(JD, addrBytes(SYS));
  assert.equal(decodeAccordEvent(bad), null);
});

test("parseAccordLog: extracts event from 'Program data:' line", () => {
  const rec = buildRulingFinalized();
  const line = `Program data: ${Buffer.from(rec).toString("base64")}`;
  const ev = parseAccordLog(line)!;
  assert.equal(ev.kind, "RulingFinalized");
});

test("parseAccordLog: non-data lines and other programs → null", () => {
  assert.equal(parseAccordLog("Program log: some text"), null);
  assert.equal(
    parseAccordLog("Program 1111 consumed 1234 compute units"),
    null,
  );
  assert.equal(parseAccordLog(""), null);
  // A Program data line whose payload isn't one of our events → null.
  const other = Buffer.from(
    cat(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]), addrBytes(SYS)),
  ).toString("base64");
  assert.equal(parseAccordLog(`Program data: ${other}`), null);
});

test("parseAccordLog: tolerates malformed base64 (no throw)", () => {
  assert.equal(parseAccordLog("Program data: !!!not-base64!!!"), null);
});

test("parseAccordLogs: multiple events in one transaction, in order", () => {
  const a = `Program data: ${Buffer.from(buildDisputeCreated()).toString("base64")}`;
  const noise = "Program log: between events";
  const b = `Program data: ${Buffer.from(buildJurorsDrawn()).toString("base64")}`;
  const out = parseAccordLogs(["Program invoke", a, noise, b]);
  assert.equal(out.length, 2);
  assert.equal(out[0].kind, "DisputeCreated");
  assert.equal(out[1].kind, "JurorsDrawn");
});
