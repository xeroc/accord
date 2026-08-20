import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccordMark, AmberRule, Wordmark } from "./brand";

describe("AccordMark", () => {
  it("renders the 3-line Accord mark (two diagonals + one vertical) converging on the center dot", () => {
    const { container } = render(<AccordMark size={96} progress={1} dot={1} />);
    const lines = container.querySelectorAll("line");
    expect(lines).toHaveLength(3);
    const circle = container.querySelector("circle");
    expect(circle).not.toBeNull();
    // every line converges on the focal point (16,16 in the 32×32 viewBox)
    for (const line of lines) {
      expect(line.getAttribute("x2")).toBe("16");
      expect(line.getAttribute("y2")).toBe("16");
    }
  });

  it("draws with progress: stroke-dashoffset = 1 − progress (pathLength=1)", () => {
    const { container } = render(
      <AccordMark size={96} progress={0.25} dot={0} />,
    );
    const line = container.querySelector("line");
    expect(line?.getAttribute("pathLength")).toBe("1");
    expect(line?.getAttribute("stroke-dashoffset")).toBe("0.75");
    expect(line?.getAttribute("stroke-dasharray")).toBe("1");
  });

  it("pops the center dot with `dot` (radius and opacity)", () => {
    const { container } = render(<AccordMark size={96} progress={1} dot={0.5} />);
    const circle = container.querySelector("circle");
    // r = 2 + 1.4 * dot at dot=0.5 → 2.7
    expect(circle?.getAttribute("r")).toBe("2.7");
    expect(circle?.getAttribute("opacity")).toBe("0.5");
  });

  it("colors via currentColor — wrap in a text color utility", () => {
    const { container } = render(
      <AccordMark size={96} progress={1} dot={1} className="text-amber" />,
    );
    expect(container.firstChild).toHaveClass("text-amber");
  });
});

describe("Wordmark", () => {
  it("renders Accord with the heading/nearwhite lockup", () => {
    render(<Wordmark enter={1} />);
    const el = screen.getByText("Accord");
    expect(el).toHaveClass("font-heading", "font-bold", "tracking-tight", "text-nearwhite");
  });

  it("enter drives opacity and the 40px settle translate", () => {
    render(<Wordmark enter={0.5} className="text-9xl" />);
    const el = screen.getByText("Accord");
    expect(el).toHaveClass("text-9xl");
    expect(el.style.opacity).toBe("0.5");
    expect(el.style.translate).toBe("0px 20px");
  });

  it("enter=1 is fully seated", () => {
    render(<Wordmark enter={1} />);
    const el = screen.getByText("Accord");
    expect(el.style.opacity).toBe("1");
    expect(el.style.translate).toBe("0px 0px");
  });
});

describe("AmberRule", () => {
  it("is the amber hairline scaling in on its center", () => {
    const { container } = render(<AmberRule enter={0.5} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass("h-1", "w-48", "rounded-full", "bg-amber", "origin-center");
    expect(el.style.scale).toBe("0.5 1");
  });

  it("enter=1 fills the rule", () => {
    const { container } = render(<AmberRule enter={1} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.scale).toBe("1 1");
  });
});
