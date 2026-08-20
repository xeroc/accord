import type { Meta, StoryObj } from "@storybook/react-vite";

import { ChainStrip } from "./chain-strip";

const meta = {
  title: "Mechanism/ChainStrip",
  component: ChainStrip,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 360, step: 1 } },
    at: { control: { type: "number", min: 0 } },
    stagger: { control: { type: "number", min: 1, max: 30 } },
    highlight: { control: { type: "number", min: 0 } },
  },
  args: { frame: 120, at: 0, stagger: 8, cells: ["a3f9", "77c2", "00…00", "e1b0"] },
} satisfies Meta<typeof ChainStrip>;

export default meta;
type Story = StoryObj<typeof ChainStrip>;

/** The strip at rest — muted blocky cells, hairline links. */
export const Resting: Story = {};

/** The hash cell lit — typing on, breathing glow, one pulse in. */
export const HashCell: Story = {
  args: {
    frame: 60,
    cells: ["slot 0", "a3f9c2d1", "slot 2"],
    highlight: 1,
    highlightAt: 20,
    typePerChar: 2,
    pulseAt: 44,
  },
};

/** A late append — the strip grows as a round files its hash. */
export const Appending: Story = {
  args: {
    frame: 45,
    cells: ["a3f9", "77c2", "e1b0"],
    appendAt: (i) => i * 18,
    shimmerAt: 36,
  },
};
