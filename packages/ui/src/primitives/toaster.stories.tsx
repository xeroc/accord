import type * as React from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { toast } from "sonner";

import { Toaster } from "./toaster";
import { Button } from "./button";


const meta = {
  title: "Primitives/Toaster",
  component: Toaster,
  parameters: {
    // Toasts are fixed-position; render just the toaster surface.
    layout: "fullscreen",
  },
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof Toaster>;

/**
 * Sonner needs no provider — mount <Toaster /> once per app and fire toasts
 * from anywhere. The kit toaster pins theme="dark" and maps popover tokens.
 */
function Playground(): React.ReactElement {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3">
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" size="sm" onClick={() => toast.success("Verdict finalized")}>
          toast.success
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast.error("Stake transaction failed")}>
          toast.error
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast.info("Evidence window closes in 1h")}>
          toast.info
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Click a button — toasts appear top-right, stacked and dismissible.
      </p>
      <Toaster />
    </div>
  );
}

export const Interactive: Story = {
  render: Playground,
};
