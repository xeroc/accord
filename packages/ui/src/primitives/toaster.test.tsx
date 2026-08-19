import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { Toaster } from "./toaster";

describe("Toaster", () => {
  it("mounts standalone — no app providers required", () => {
    render(<Toaster />);
    // Sonner's live region renders immediately; the <ol> only appears once a
    // toast exists. No context from the host app is involved.
    const region = document.querySelector('section[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("tabindex", "-1");
  });

  it("displays toasts fired after mount", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button" onClick={() => toast.success("Verdict finalized")}>
          fire
        </button>
        <Toaster />
      </div>,
    );

    expect(screen.queryByText("Verdict finalized")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "fire" }));
    expect(await screen.findByText("Verdict finalized")).toBeVisible();
  });
});
