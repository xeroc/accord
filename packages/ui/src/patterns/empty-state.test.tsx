import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders title and description in the dashed panel", () => {
    render(<EmptyState title="No subaccords yet." description="Create the first pool." />);
    const panel = screen.getByText("No subaccords yet.").closest("div");
    expect(panel).toHaveClass(
      "rounded-lg",
      "border",
      "border-dashed",
      "border-border",
      "p-12",
      "text-center",
    );
    expect(screen.getByText("Create the first pool.")).toBeInTheDocument();
  });

  it("renders the action slot when provided", () => {
    render(
      <EmptyState title="Empty." action={<button type="button">Do the thing.</button>} />,
    );
    expect(screen.getByRole("button", { name: "Do the thing." })).toBeInTheDocument();
  });

  it("omits the description and action nodes when not provided", () => {
    render(<EmptyState title="Bare." />);
    expect(screen.getByText("Bare.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
