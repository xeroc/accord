import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("renders the default title, the message, and a Retry button", () => {
    render(<ErrorState message="404 Not Found" onRetry={() => {}} />);
    expect(screen.getByText("Read failed.")).toBeInTheDocument();
    expect(screen.getByText("404 Not Found")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry." }),
    ).toBeInTheDocument();
  });

  it("invokes onRetry when Retry is clicked", async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="boom" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry." }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("accepts custom title and retry label", () => {
    render(
      <ErrorState
        title="Publish failed."
        retryLabel="Try again."
        message="daemon unreachable"
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText("Publish failed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again." })).toBeInTheDocument();
  });
});
