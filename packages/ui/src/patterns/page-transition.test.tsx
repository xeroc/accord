import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { PageTransition } from "./page-transition";

function Page({
  label,
  onUnmount,
}: {
  label: string;
  onUnmount?: () => void;
}) {
  useEffect(() => onUnmount, [onUnmount]);
  return <p>{label}</p>;
}

describe("PageTransition", () => {
  it("renders children inside the animated wrapper", () => {
    render(
      <PageTransition transitionKey="/disputes">
        <Page label="disputes page" />
      </PageTransition>,
    );
    expect(screen.getByText("disputes page")).toBeInTheDocument();
  });

  it("remounts children when transitionKey changes", async () => {
    const onUnmount = vi.fn();
    const { rerender } = render(
      <PageTransition transitionKey="/disputes">
        <Page label="disputes page" onUnmount={onUnmount} />
      </PageTransition>,
    );
    expect(onUnmount).not.toHaveBeenCalled();

    rerender(
      <PageTransition transitionKey="/juror">
        <Page label="juror page" onUnmount={onUnmount} />
      </PageTransition>,
    );

    // mode="wait": the old page exits (0.3s spring) before the new mounts.
    await waitFor(
      () => {
        expect(screen.getByText("juror page")).toBeInTheDocument();
        expect(screen.queryByText("disputes page")).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(onUnmount).toHaveBeenCalled();
  });
});
