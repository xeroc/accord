import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PageShell } from "./page-shell";

describe("PageShell", () => {
  it("renders header slot above children in the centered main", () => {
    render(
      <PageShell header={<header>ACCORD bar</header>}>
        <p>page body</p>
      </PageShell>,
    );

    const main = screen.getByRole("main");
    expect(main).toHaveClass(
      "mx-auto",
      "min-h-screen",
      "max-w-6xl",
      "px-6",
      "py-8",
    );
    expect(screen.getByText("page body")).toBeInTheDocument();

    const wrapper = main.parentElement!;
    expect(wrapper).toContainElement(screen.getByText("ACCORD bar"));
    expect(wrapper.textContent).toMatch(/^ACCORD barpage body$/); // header first
  });

  it("renders without a header", () => {
    render(
      <PageShell>
        <p>bare page</p>
      </PageShell>,
    );
    expect(screen.getByRole("main")).toHaveTextContent("bare page");
    expect(screen.getByRole("main").previousElementSibling).toBeNull();
  });

  it("merges contentClassName into main and spreads div props onto the wrapper", () => {
    render(
      <PageShell contentClassName="max-w-none" data-testid="shell">
        <p>wide</p>
      </PageShell>,
    );
    const main = screen.getByRole("main");
    expect(main).toHaveClass("max-w-none");
    expect(main).not.toHaveClass("max-w-6xl"); // tailwind-merge replaced it
    expect(screen.getByTestId("shell")).toContainElement(main);
  });
});
