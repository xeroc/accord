import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccordMark } from "./accord-mark";

describe("AccordMark", () => {
  it("renders the 3-line Accord mark (two diagonals + one vertical) converging on the center dot", () => {
    const { container } = render(<AccordMark />);
    const lines = container.querySelectorAll("line");
    expect(lines).toHaveLength(3);
    expect(container.querySelector("circle")).toBeNull();
    for (const line of lines) {
      expect(line.getAttribute("x2")).toBe("16");
      expect(line.getAttribute("y2")).toBe("16");
    }
  });

  it("defaults to fully drawn — usable as a static logo with no props", () => {
    const { container } = render(<AccordMark />);
    expect(container.querySelector("line")?.getAttribute("stroke-dashoffset")).toBe("0");
  });

  it("draws with progress: dashoffset = 1 − progress", () => {
    const { container } = render(<AccordMark progress={0.25} />);
    expect(container.querySelector("line")?.getAttribute("stroke-dashoffset")).toBe("0.75");
  });

  it("scales via width/height and colors via currentColor", () => {
    const { container } = render(<AccordMark size={64} className="text-amber" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("64");
    expect(svg).toHaveClass("text-amber");
  });
});
