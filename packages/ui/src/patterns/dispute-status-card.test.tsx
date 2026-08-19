import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DisputeStatusCard } from "./dispute-status-card";

const PENDING_ROWS = [
  { label: "Dispute", value: "9WzD…AWWM" },
  { label: "State", value: "Live" },
  { label: "Round", value: 2 },
  { label: "Ruling", value: "pending" },
  { label: "Filed", value: "2026-08-12 14:02" },
] as const;

describe("DisputeStatusCard", () => {
  it("renders title, rows as dt/dd pairs, action link, and note", () => {
    const { container } = render(
      <DisputeStatusCard
        title="Backing dispute"
        rows={PENDING_ROWS}
        action={
          <a href="https://accord.example/#/disputes/abc">
            Open in Accord →
          </a>
        }
        note={<p>settle hint</p>}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Backing dispute" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("dt")).toHaveLength(5);
    expect(container.querySelectorAll("dd")).toHaveLength(5);
    expect(container.querySelector("dl")).toHaveTextContent("Ruling");
    expect(container.querySelectorAll("dd")[3]).toHaveTextContent("pending");
    const link = screen.getByRole("link", { name: "Open in Accord →" });
    expect(link).toHaveAttribute(
      "href",
      "https://accord.example/#/disputes/abc",
    );
    expect(screen.getByText("settle hint")).toBeInTheDocument();
  });

  it("renders with zero rows without crashing", () => {
    const { container } = render(<DisputeStatusCard rows={[]} />);
    expect(container.querySelector("section")).toBeInTheDocument();
    expect(container.querySelector("dl")).toBeInTheDocument();
    expect(container.querySelectorAll("dt")).toHaveLength(0);
  });

  it("omits the heading when no title is given", () => {
    const { container } = render(
      <DisputeStatusCard rows={[{ label: "State", value: "Live" }]} />,
    );
    expect(container.querySelector("h3")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("State")).toBeInTheDocument();
  });
});
