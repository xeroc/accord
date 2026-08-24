import type { Meta, StoryObj } from "@storybook/react-vite";

import { PayoutFlow } from "./payout-flow";

const meta = {
  title: "Mechanism/PayoutFlow",
  component: PayoutFlow,
  parameters: { layout: "centered" },
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 200, step: 1 } },
    at: { control: { type: "number", min: 0 } },
    payout: { control: { type: "number", min: 0 } },
  },
  args: { frame: 200, at: 0 },
} satisfies Meta<typeof PayoutFlow>;

export default meta;
type Story = StoryObj<typeof PayoutFlow>;

/** The full run, settled: challenged, adjudicated, paid after the verdict. */
export const Settled: Story = {};

/** Mid-window: the bar draining, the auto-pay future still alive. */
export const MidWindow: Story = {
  args: { frame: 75 },
};

/** A custom payout amount on a delayed clock. */
export const CustomAmount: Story = {
  args: { frame: 200, at: 20, payout: 250_000 },
};
