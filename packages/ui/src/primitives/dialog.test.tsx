import type * as React from "react";

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";


import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Button } from "./button";

function TestDialog(): React.ReactElement {
  return (
    <Dialog>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join dispute</DialogTitle>
          <DialogDescription>
            You will stake 500 USDC for deliberation.
          </DialogDescription>
        </DialogHeader>
        <input aria-label="Alias" />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("opens on trigger click and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(screen.getByRole("dialog")).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("derives its accessible name and description from Title/Description", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    await user.click(screen.getByRole("button", { name: "Open dialog" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Join dispute");
    expect(dialog).toHaveAccessibleDescription(
      "You will stake 500 USDC for deliberation.",
    );
  });

  it("traps Tab focus inside the open dialog", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const dialog = screen.getByRole("dialog");

    // Radix focuses the content on open; every Tab stop stays inside.
    expect(dialog).toContain(document.activeElement);

    // Focusables: close (X) button, alias input, Cancel button.
    // Tab past the last one wraps back inside the dialog.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(dialog).toContain(document.activeElement);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("returns focus to the trigger after closing via Escape", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    const trigger = screen.getByRole("button", { name: "Open dialog" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes via the built-in close button (aria-label Close)", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
