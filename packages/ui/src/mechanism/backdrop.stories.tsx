import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Backdrop } from "./backdrop";
import { useWallClockFrame } from "./clock";

const meta = {
  title: "Mechanism/Backdrop",
  component: Backdrop,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 1800, step: 1 } },
    seed: { control: "text" },
  },
  args: { seed: "storybook" },
} satisfies Meta<typeof Backdrop>;

export default meta;
type Story = StoryObj<typeof Backdrop>;

/** Live on the wall clock (frozen under reduced motion) — the landing
 *  hero and every video scene run exactly this. */
function BackdropLiveDemo() {
  const [manual, setManual] = useState(0);
  const live = useWallClockFrame({ fps: 30 });
  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-72 overflow-hidden rounded-lg bg-background">
        <Backdrop frame={live + manual} seed="storybook" />
      </div>
      <label className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
        frame offset
        <input
          type="range"
          min={0}
          max={900}
          value={manual}
          onChange={(e) => setManual(Number(e.target.value))}
        />
        {manual}
      </label>
    </div>
  );
}
export const Live: Story = { render: () => <BackdropLiveDemo /> };

/** A single frozen frame — the deterministic contract: same frame in,
 *  same pixels out, in any runtime. */
export const FrozenFrame: Story = {
  args: { frame: 450 },
  render: (args) => (
    <div className="relative h-72 overflow-hidden rounded-lg bg-background">
      <Backdrop {...args} />
    </div>
  ),
};
