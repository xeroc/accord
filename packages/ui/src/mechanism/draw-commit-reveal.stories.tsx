import type { Meta, StoryObj } from "@storybook/react-vite";

import { DrawCommitReveal } from "./draw-commit-reveal";

const meta = {
  parameters: { layout: "centered" },
  title: "Mechanism/DrawCommitReveal",
  component: DrawCommitReveal,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 240, step: 1 } },
    rulingAt: { control: { type: "number", min: 0 } },
  },
  args: { frame: 200, rulingAt: 175 },
} satisfies Meta<typeof DrawCommitReveal>;

export default meta;
type Story = StoryObj<typeof DrawCommitReveal>;

/** The full pipeline — drawn, committed, revealed, ruled. */
export const Full: Story = {};

/** Mid-beat — pool drawn, commits scrambling in, no reveal yet. */
export const Committing: Story = {
  args: { frame: 100 },
};

/** Just the draw — three jurors popping out of the pool. */
export const Drawing: Story = {
  args: { frame: 65 },
};
