import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("renders a multi-line textbox", () => {
    render(<Textarea placeholder="Evidence manifest" aria-label="Manifest" />);

    const el = screen.getByRole("textbox", { name: "Manifest" });
    expect(el.tagName).toBe("TEXTAREA");
  });

  it("passes through disabled and aria-invalid", () => {
    render(
      <Textarea aria-label="Manifest" defaultValue="m" disabled aria-invalid />
    );

    const el = screen.getByRole("textbox", { name: "Manifest" });
    expect(el).toBeDisabled();
    expect(el).toHaveAttribute("aria-invalid", "true");
  });
});
