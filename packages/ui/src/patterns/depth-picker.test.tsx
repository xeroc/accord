import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DepthPicker } from "./depth-picker";

describe("DepthPicker", () => {
  it("renders the full curated ladder with the top option marked max", async () => {
    const user = userEvent.setup();
    render(<DepthPicker value="12" onChange={() => {}} />);
    const trigger = screen.getByRole("combobox", { name: "Pool capacity" });
    expect(trigger).toHaveTextContent("4,096 seats");
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("option", { name: "16 seats — testing" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "65,536 seats — max" }),
    ).toBeInTheDocument();
  });

  it("trims the ladder to maxDepth and relabels the last option as max", async () => {
    const user = userEvent.setup();
    render(<DepthPicker value="8" onChange={() => {}} maxDepth={8} />);
    const trigger = screen.getByRole("combobox", { name: "Pool capacity" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("option", { name: "16 seats — testing" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /1,024/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "256 seats — max" }),
    ).toBeInTheDocument();
  });

  it("reports the chosen depth and interpolates maxDepth into the tx-bound note", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DepthPicker value="4" onChange={onChange} maxDepth={8} />);
    expect(screen.getByText(/beyond 8 exceed/)).toBeInTheDocument();
    const trigger = screen.getByRole("combobox", { name: "Pool capacity" });
    trigger.focus();
    await user.keyboard("{ArrowDown}"); // highlight 4 (first)
    await user.keyboard("{ArrowDown}"); // highlight 6
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("6");
  });
});
