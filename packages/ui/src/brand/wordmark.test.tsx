import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AmberRule } from "./amber-rule";
import { Wordmark } from "./wordmark";

describe("Wordmark", () => {
  it("renders Accord with the heading/nearwhite lockup", () => {
    render(<Wordmark />);
    const el = screen.getByText("Accord");
    expect(el).toHaveClass("font-heading", "font-bold", "tracking-tight", "text-nearwhite");
  });

  it("defaults to fully entered — static for app/landing use", () => {
    render(<Wordmark />);
    const el = screen.getByText("Accord");
    expect(el.style.opacity).toBe("1");
    expect(el.style.translate).toBe("0px 0px");
  });

  it("enter drives opacity and the settle translate", () => {
    render(<Wordmark enter={0.5} settle={24} className="text-8xl" />);
    const el = screen.getByText("Accord");
    expect(el).toHaveClass("text-8xl");
    expect(el.style.opacity).toBe("0.5");
    expect(el.style.translate).toBe("0px 12px");
  });
});

describe("AmberRule", () => {
  it("is the amber hairline, fully scaled by default", () => {
    const { container } = render(<AmberRule />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass("h-1", "w-48", "rounded-full", "bg-amber", "origin-center");
    expect(el.style.scale).toBe("1 1");
  });

  it("enter scales it in on its center; className overrides size", () => {
    const { container } = render(<AmberRule enter={0.5} className="h-1.5 w-56" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.scale).toBe("0.5 1");
    expect(el).toHaveClass("h-1.5", "w-56");
    expect(el).not.toHaveClass("w-48");
  });
});
