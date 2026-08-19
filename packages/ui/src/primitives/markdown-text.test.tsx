import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { MarkdownText } from "./markdown-text";

describe("MarkdownText", () => {
  it("renders markdown formatting (h1/strong/code/paragraphs)", () => {
    const { container } = render(
      <MarkdownText source={"# Title\n\n**bold** and `code`"} />,
    );
    expect(container.querySelector("h1")).toHaveTextContent("Title");
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("code")).toHaveTextContent("code");
  });

  it("renders GFM tables (remark-gfm active)", () => {
    const { container } = render(
      <MarkdownText source={"| a | b |\n| - | - |\n| 1 | 2 |"} />,
    );
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(container.querySelectorAll("td")).toHaveLength(2);
  });

  it("escapes raw HTML — no live <script>/<img onerror>", () => {
    const { container } = render(
      <MarkdownText
        source={"<script>alert(1)</script><img src=x onerror=alert(1)>"}
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    // Raw HTML is escaped to inert text.
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("links open in a new tab with noopener noreferrer", () => {
    render(<MarkdownText source={"[Accord](https://accord.example)"} />);
    const link = screen.getByRole("link", { name: "Accord" });
    expect(link).toHaveAttribute("href", "https://accord.example");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("strips unsafe javascript: protocol from link hrefs", () => {
    const { container } = render(
      <MarkdownText source={"[x](javascript:alert(1))"} />,
    );
    const href = container.querySelector("a")?.getAttribute("href") ?? "";
    expect(href).not.toMatch(/javascript:/i);
    expect(container.innerHTML).not.toMatch(/javascript:/i);
  });
});
