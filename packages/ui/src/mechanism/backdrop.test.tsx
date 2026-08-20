import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Backdrop } from "./backdrop";

describe("Backdrop", () => {
  it("renders the four ambient layers (grid, juror field, verdict glow, vignette)", () => {
    const { container } = render(<Backdrop frame={0} seed="test" />);
    const root = container.firstElementChild as HTMLElement;
    const layers = Array.from(root.children) as HTMLElement[];
    const [grid, field, glow, vignette] = layers;
    expect(grid?.style.backgroundImage).toContain("repeating-linear-gradient");
    expect(field?.querySelectorAll("[data-node]").length).toBe(26);
    expect(glow?.style.background).toContain("radial-gradient");
    expect(glow?.style.background).toContain("--accord-amber");
    expect(vignette?.style.background).toContain("ellipse at center");
  });

  it("seeds 26 juror-field nodes, each with a stem", () => {
    const { container } = render(<Backdrop frame={0} seed="test" />);
    expect(container.querySelectorAll("[data-node]").length).toBe(26);
    expect(container.querySelectorAll("[data-stem]").length).toBe(26);
  });

  it("is a pure function of frame — same frame renders identical markup, drift moves with frame", () => {
    const a = render(<Backdrop frame={100} seed="pure" />).container.innerHTML;
    const b = render(<Backdrop frame={100} seed="pure" />).container.innerHTML;
    const c = render(<Backdrop frame={200} seed="pure" />).container.innerHTML;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("seed changes the node field layout", () => {
    const a = render(<Backdrop frame={0} seed="one" />).container.innerHTML;
    const b = render(<Backdrop frame={0} seed="two" />).container.innerHTML;
    expect(a).not.toBe(b);
  });

  it("grid drift cycles seamlessly — one full period later the translate repeats", () => {
    const at = (f: number) =>
      (render(<Backdrop frame={f} seed="grid" />).container.firstElementChild
        ?.firstElementChild as HTMLElement).style.translate;
    expect(at(900)).toBe(at(1800));
  });
});
