/**
 * isPublicTrace units (ADR-0037 flip-publication): sealed flip not public,
 * unsealed flip public, hold never public.
 */
import { describe, expect, it } from "bun:test";

import { isPublicTrace } from "./trace-visibility.js";
import type { TraceEnvelope } from "../server/handlers.js";

const NOW = 1_700_000_000_000;

function frame(event: Record<string, unknown>): TraceEnvelope {
  return { v: 1, at: NOW, seq: 1, juror: "j", dispute: "d", event };
}

describe("isPublicTrace", () => {
  it("unsealed option-1 verdict is public", () => {
    expect(isPublicTrace([frame({ kind: "verdict", optionIndex: 1 })], NOW)).toBe(true);
  });

  it("sealed flip is not public (seal wins over publication)", () => {
    expect(
      isPublicTrace([frame({ kind: "verdict", optionIndex: 1, unsealAt: NOW + 1 })], NOW),
    ).toBe(false);
    // same record after the unseal instant → public
    expect(
      isPublicTrace([frame({ kind: "verdict", optionIndex: 1, unsealAt: NOW + 1 })], NOW + 1),
    ).toBe(true);
  });

  it("hold (option 0) is never public", () => {
    expect(isPublicTrace([frame({ kind: "verdict", optionIndex: 0 })], NOW)).toBe(false);
  });

  it("non-verdict frames and empty records are not public", () => {
    expect(isPublicTrace([frame({ kind: "commit", optionIndex: 1 })], NOW)).toBe(false);
    expect(isPublicTrace([], NOW)).toBe(false);
  });
});
