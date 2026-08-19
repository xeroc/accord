import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Copyable } from "./copyable";

const ADDRESS = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

/** jsdom's navigator.clipboard is a getter-only property; define it fresh. */
function mockClipboard(writeText: Mock): void {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Copyable", () => {
  it("shortens long values to head…tail and shows short values whole", () => {
    const { container } = render(
      <span>
        <Copyable value={ADDRESS} />
        <Copyable value="JRY-7" />
      </span>,
    );
    expect(container).toHaveTextContent("9WzD…AWWM");
    expect(container).toHaveTextContent("JRY-7");
  });

  it("copies the FULL value (not the shortened display)", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    render(<Copyable value={ADDRESS} />);

    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
  });

  it("flips to the copied state after a successful copy", async () => {
    const user = userEvent.setup();
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    render(<Copyable value={ADDRESS} />);

    // Both icons always exist; the cross-fade toggles their opacity classes.
    const copyIcon = document.querySelector(".lucide-copy");
    const checkIcon = document.querySelector(".lucide-check");
    expect(copyIcon).not.toBeNull();
    expect(checkIcon).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));
    expect(copyIcon).toHaveClass("opacity-0");
    expect(checkIcon).not.toHaveClass("opacity-0");
  });

  it("survives clipboard failure without crashing or showing copied", async () => {
    const user = userEvent.setup();
    mockClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    render(<Copyable value={ADDRESS} />);

    const copyIcon = document.querySelector(".lucide-copy");
    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));
    // Flush the rejected promise through the component's try/catch.
    await Promise.resolve();

    expect(copyIcon).not.toBeNull();
    expect(copyIcon).not.toHaveClass("opacity-0");
    // Component is still interactive — no crash unmounted the tree.
    expect(
      screen.getByRole("button", { name: "Copy to clipboard" }),
    ).toBeInTheDocument();
  });
});
