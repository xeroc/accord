import type * as React from "react";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { EASE_EXPO, ErrorShake, Reveal, StaggerGroup, StaggerItem } from "./index";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Skeleton } from "../primitives/skeleton";

const meta = {
  title: "Motion/Primitives",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Motion primitives from the Accord design system (DESIGN.md §08). Brand easing: cubic-bezier(0.22, 1, 0.36, 1) — exported as EASE_EXPO. Reduced-motion is handled globally via MotionConfig in each app's providers, not per-component.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** Lists stagger in on mount: each item fades, slides 12px, and unblurs. */
export const StaggerList: Story = {
  render: () => (
    <StaggerGroup className="flex max-w-sm flex-col gap-3">
      {["Dispute #1042 — Evidence", "Dispute #1039 — Deliberation", "Dispute #1031 — Finalized", "Dispute #1027 — Slashed"].map(
        (label) => (
          <StaggerItem
            key={label}
            className="rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-foreground/10"
          >
            {label}
          </StaggerItem>
        ),
      )}
    </StaggerGroup>
  ),
};

function RevealDemo(): React.ReactElement {
  const [loading, setLoading] = useState(true);
  return (
    <div className="flex max-w-sm flex-col gap-3">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setLoading((v) => !v)}>
          {loading ? "Load content" : "Back to skeleton"}
        </Button>
      </div>
      <Reveal state={loading ? "skeleton" : "content"}>
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : (
          <p className="text-sm">
            Verdict posted by juror 2 of 2 — the dispute finalized in 3 days.
            Both stakes returned with fee share.
          </p>
        )}
      </Reveal>
    </div>
  );
}

/** Cross-blur swap for loading→content; skeleton mounts without a flash-in. */
export const RevealLoadingToContent: Story = {
  render: () => <RevealDemo />,
};

function ErrorShakeDemo(): React.ReactElement {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <ErrorShake active={error}>
        <Input
          aria-label="Stake amount"
          aria-invalid={error || undefined}
          placeholder="Stake amount (USDC)"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
        />
      </ErrorShake>
      <Button
        size="sm"
        onClick={() => setError(Number(value) < 500)}
        className="w-fit"
      >
        Validate (min 500)
      </Button>
      <p className="text-xs text-muted-foreground">
        Submitting an amount below 500 flips <code>active</code> false→true and
        fires the damped ±8px shake (400ms, 3 oscillations). Reduced-motion:
        disabled globally via MotionConfig in the app providers.
      </p>
    </div>
  );
}

export const ShakeOnError: Story = {
  render: () => <ErrorShakeDemo />,
};

/** The exported easing constant — document it, assert the curve shape. */
export const EasingToken: Story = {
  render: () => (
    <div className="font-mono text-xs">
      EASE_EXPO = [{EASE_EXPO.join(", ")}] — cubic-bezier(0.22, 1, 0.36, 1)
    </div>
  ),
};
