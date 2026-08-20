import type { Meta, StoryObj } from "@storybook/react-vite";

import { RulingStamp } from "./ruling-stamp";

const meta = {
  title: "Mechanism/RulingStamp",
  component: RulingStamp,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 360, step: 1 } },
    at: { control: { type: "number", min: 0 } },
    dur: { control: { type: "number", min: 1, max: 30 } },
    size: { control: "select", options: ["lg", "md"] },
    glow: { control: "boolean" },
  },
  args: { frame: 300, text: "RULING: YES", at: 272 },
} satisfies Meta<typeof RulingStamp>;

export default meta;
type Story = StoryObj<typeof RulingStamp>;

/** The hero size — the schelling-court landing moment. */
export const Landed: Story = {};

/** The compact cut used inside pipeline diagrams. */
export const Compact: Story = {
  args: { size: "md", text: "RULING: YES" },
};

/** Mid-slam — 1.6×, counter-clockwise, still settling. */
export const MidSlam: Story = {
  args: { frame: 277 },
};

/** No glow — for dense layouts where the halo fights neighbors. */
export const Quiet: Story = {
  args: { glow: false },
};
