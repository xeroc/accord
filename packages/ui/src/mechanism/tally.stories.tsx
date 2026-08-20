import type { Meta, StoryObj } from "@storybook/react-vite";

import { TallyBar } from "./tally";

const meta = {
  title: "Mechanism/TallyBar",
  component: TallyBar,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 360, step: 1 } },
    yes: { control: { type: "number", min: 0 } },
    no: { control: { type: "number", min: 0 } },
    at: { control: { type: "number", min: 0 } },
    width: { control: { type: "number", min: 200, max: 900 } },
  },
  args: { frame: 300, at: 232, width: 600 },
} satisfies Meta<typeof TallyBar>;

export default meta;
type Story = StoryObj<typeof TallyBar>;

/** A decisive 4:1 majority, fully assembled. */
export const Decisive: Story = {
  args: { yes: 4, no: 1 },
};

/** A narrower 3:2 split — the bar still tips clearly. */
export const Narrow: Story = {
  args: { yes: 3, no: 2 },
};

/** Still growing — the amber bar leads, the minority trails. */
export const Assembling: Story = {
  args: { frame: 245, yes: 4, no: 1 },
};
