import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button, buttonVariants } from "./button";

describe("Button", () => {
  it("renders with default variant and size", () => {
    render(<Button>Ship it</Button>);
    const btn = screen.getByRole("button", { name: "Ship it" });
    expect(btn).toHaveAttribute("data-variant", "default");
    expect(btn).toHaveAttribute("data-size", "default");
    expect(btn).toHaveAttribute("data-slot", "button");
  });

  it.each(["outline", "secondary", "ghost", "destructive", "link"] as const)(
    "renders %s variant",
    (variant) => {
      render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole("button", { name: variant })).toHaveAttribute(
        "data-variant",
        variant,
      );
    },
  );

  it("respects disabled", () => {
    render(<Button disabled>nope</Button>);
    expect(screen.getByRole("button", { name: "nope" })).toBeDisabled();
  });


  it("merges variant/size onto the child element with asChild", () => {
    render(
      <Button asChild variant="outline" size="sm">
        <a href="https://useaccord.com">Anchor</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Anchor" });
    expect(link).toHaveAttribute("data-slot", "button");
    expect(link).toHaveAttribute("data-variant", "outline");
    expect(link).toHaveAttribute("data-size", "sm");
  });

  it.each(["icon", "icon-xs", "icon-sm", "icon-lg"] as const)(
    "renders %s size",
    (size) => {
      render(
        <Button size={size} aria-label="Add">
          +
        </Button>,
      );
      expect(screen.getByRole("button", { name: "Add" })).toHaveAttribute(
        "data-size",
        size,
      );
    },
  );
  it("exposes buttonVariants for link-style call sites", () => {
    expect(buttonVariants({ variant: "link" })).toContain("underline");
  });
});
