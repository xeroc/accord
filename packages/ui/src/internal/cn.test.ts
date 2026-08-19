import { describe, expect, it } from "vitest";
import { cn } from "./cn";

/**
 * Ported from apps/synod/src/lib/utils.test.ts (deleted when Synod migrated
 * to @useaccord/ui) — cn merge semantics are the kit's contract now.
 */
describe("cn", () => {
  it("merges conditional classes", () => {
    expect(cn("a", false && "b", true && "c")).toBe("a c");
  });

  it("last conflicting class wins (tailwind-merge)", () => {
    expect(cn("rounded-md bg-muted", "rounded-sm bg-border")).toBe(
      "rounded-sm bg-border",
    );
  });

  it("passes non-tailwind classes through", () => {
    expect(cn("keep-me", "w-full")).toBe("keep-me w-full");
  });
});
