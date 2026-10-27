/**
 * send.test.ts — unit tests for extractLogs (the gate that classifies a crank
 * tx failure as simulation vs transient). The rest of sendIx needs a live RPC;
 * this pins the pure log-extraction logic against the three shapes
 * `@solana/kit` produces, so a regression here can't silently turn sim
 * failures into retried, log-less SendErrors again.
 */
import { test, expect } from "bun:test";

import { extractLogs, formatError, programLogReason, SimulationError } from "./send.js";

/** Build a plain Error shaped like a kit SolanaError (without importing it). */
function solanaError(context: Record<string, unknown>, cause?: unknown): Error {
  const e = new Error("Transaction simulation failed");
  e.name = "SolanaError";
  Object.assign(e, { context });
  if (cause !== undefined) {
    (e as { cause?: unknown }).cause = cause;
  }
  return e;
}

test("extracts logs from a kit preflight SolanaError (error.context.logs)", () => {
  // Shape produced by getSolanaErrorFromJsonRpcError for code -32003:
  // new SolanaError(PREFLIGHT_FAILURE, { ...data-minus-err }) where data.logs
  // is the program trace.
  const e = solanaError({
    __code: -32003,
    logs: [
      "Program cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed invoke [1]",
      "Program log: Instruction: DrawSeat",
      "Program log: AnchorError: SeatAlreadyFilled",
      "Program failed to complete: custom program error: 0x3",
    ],
    unitsConsumed: 4567,
  });
  expect(extractLogs(e)).toEqual([
    "Program cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed invoke [1]",
    "Program log: Instruction: DrawSeat",
    "Program log: AnchorError: SeatAlreadyFilled",
    "Program failed to complete: custom program error: 0x3",
  ]);
});

test("extracts transactionLogs from a confirmation-time failure (direct property)", () => {
  const e = new Error("transaction landed but failed on-chain");
  Object.assign(e, { transactionLogs: ["log A", "log B"] });
  expect(extractLogs(e)).toEqual(["log A", "log B"]);
});

test("walks the .cause chain", () => {
  const inner = new Error("inner");
  Object.assign(inner, { logs: ["deep"] });
  const outer = new Error("outer", { cause: inner });
  expect(extractLogs(outer)).toEqual(["deep"]);
});

test("returns undefined when no logs anywhere (transient failure)", () => {
  expect(extractLogs(new Error("network blip"))).toBeUndefined();
});

test("ignores non-string log entries", () => {
  const e = solanaError({ logs: [1, 2, 3] });
  expect(extractLogs(e)).toBeUndefined();
});

test("terminates on circular cause chains", () => {
  const a: { cause?: unknown; logs?: unknown } = {};
  const b: { cause?: unknown } = { cause: a };
  a.cause = b; // a -> b -> a ...
  expect(extractLogs(a)).toBeUndefined();
});

test("programLogReason: Anchor error code + message from the trace", () => {
  const reason = programLogReason([
    "Program cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed invoke [1]",
    "Program log: Instruction: DrawSeat",
    "Program log: AnchorError occurred. Error Code: SeatAlreadyFilled. Error Number: 6014. Error Message: This seat is already drawn.",
    "Program failed to complete: custom program error: 0x179e",
    "Program cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed failed: custom program error: 0x179e",
  ]);
  expect(reason).toBe("SeatAlreadyFilled: This seat is already drawn.");
});

test("programLogReason: bare code line without message", () => {
  expect(programLogReason(["Program log: Error Code: InvalidRound"])).toBe("InvalidRound");
});

test("programLogReason: no Anchor line → custom program error hex", () => {
  expect(programLogReason(["Program failed to complete: custom program error: 0x3"])).toBe(
    "custom program error 0x3",
  );
});

test("programLogReason: clean trace → undefined", () => {
  expect(programLogReason(["Program log: Instruction: DrawSeat"])).toBeUndefined();
  expect(programLogReason([])).toBeUndefined();
});

test("programLogReason: panic line wins over earlier codes", () => {
  expect(
    programLogReason([
      "Program log: Error Code: SeatAlreadyFilled",
      "Program log: panicked at 'attempt to subtract with overflow', src/draw.rs:42",
    ]),
  ).toBe("panicked at 'attempt to subtract with overflow', src/draw.rs:42");
});

test("formatError: Error → `Name: message`, non-Error stringified", () => {
  expect(formatError(new SimulationError("boom", []))).toBe("SimulationError: boom");
  expect(formatError("nope")).toBe("nope");
});
