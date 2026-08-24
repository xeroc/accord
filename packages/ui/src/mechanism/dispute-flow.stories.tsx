import type { Meta, StoryObj } from "@storybook/react-vite";

import { DisputeFlow } from "./dispute-flow";

const meta = {
  parameters: { layout: "centered" },
  title: "Mechanism/DisputeFlow",
  component: DisputeFlow,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 180, step: 1 } },
    at: { control: { type: "number", min: 0 } },
  },
  args: { frame: 100, at: 15 },
} satisfies Meta<typeof DisputeFlow>;

export default meta;
type Story = StoryObj<typeof DisputeFlow>;

/** The full flow — wires pulsing, consumers fanned out. */
export const Full: Story = {};

/** Blocks entered, wires pulsing, before the consumer fan-out. */
export const BeforeFanOut: Story = {
  args: { frame: 45 },
};

/** Custom consumers — any program can read it. */
export const CustomConsumers: Story = {
  args: {
    consumers: ["escrow", "insurance", "dao treasury", "+ your program"],
  },
};
