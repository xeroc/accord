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

  it("shows a spinner and disables itself while loading", () => {
    render(<Button loading>Sign</Button>);
    const btn = screen.getByRole("button", { name: "Sign" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn.querySelector("[data-slot=spinner]")).not.toBeNull();
  });

  it("loading spinner is the kit Spinner (animate-spin), visually hidden from the name", () => {
    render(<Button loading>Publish</Button>);
    const spinner = screen
      .getByRole("button", { name: "Publish" })
      .querySelector("[data-slot=spinner]")!;
    expect(spinner).toHaveClass("animate-spin");
    expect(spinner).toHaveAttribute("aria-hidden", "true");
  });

  it("renders no spinner when not loading", () => {
    render(<Button>Idle</Button>);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Idle" })).not.toHaveAttribute(
      "aria-busy",
    );
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
