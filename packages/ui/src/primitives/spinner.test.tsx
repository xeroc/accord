import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Spinner } from "./spinner";

describe("Spinner", () => {
  it("announces itself as a loading status", () => {
    render(<Spinner />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
  });

  it("is an svg that merges custom classes", () => {
    render(<Spinner className="size-6" data-testid="spin" />);

    const el = screen.getByTestId("spin");
    expect(el).toHaveClass("size-6");
  });
});
