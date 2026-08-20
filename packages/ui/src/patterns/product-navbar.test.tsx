import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProductNavbar } from "./product-navbar";

describe("ProductNavbar", () => {
  it("renders all slots inside the sticky header, no router/wallet deps", () => {
    render(
      <ProductNavbar
        brand={<a href="/">ACCORD</a>}
        navigation={<nav>disputes · juror</nav>}
        accountControls={<button type="button">Connect wallet.</button>}
      />,
    );

    const header = screen.getByRole("banner");
    expect(header).toHaveClass(
      "sticky",
      "top-0",
      "z-50",
      "backdrop-blur-xl",
      "font-mono",
    );
    expect(screen.getByRole("link", { name: "ACCORD" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(header).toHaveTextContent("disputes · juror");
    expect(
      screen.getByRole("button", { name: "Connect wallet." }),
    ).toBeInTheDocument();
  });

  it("renders brand-only when navigation and accountControls are omitted", () => {
    render(<ProductNavbar brand={<span>CANON</span>} />);

    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent("CANON");
    expect(header.querySelector("button")).toBeNull();
    expect(header.querySelectorAll("div")).toHaveLength(1); // right-side wrap, empty
  });

  it("appends className to the header shell", () => {
    render(
      <ProductNavbar brand={<span>SYNOD</span>} className="border-b" />,
    );
    expect(screen.getByRole("banner")).toHaveClass("border-b", "sticky");
  });
});
