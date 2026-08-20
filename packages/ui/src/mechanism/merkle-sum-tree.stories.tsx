import type { Meta, StoryObj } from "@storybook/react-vite";

import { MerkleSumTree } from "./merkle-sum-tree";

const LEAVES = [120, 80, 140, 60, 200, 160, 90, 150];

const meta = {
  title: "Mechanism/MerkleSumTree",
  component: MerkleSumTree,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 240, step: 1 } },
    at: { control: { type: "number", min: 0 } },
    updateAt: { control: { type: "number", min: 0 } },
    hopDur: { control: { type: "number", min: 6, max: 30 } },
  },
  args: { frame: 120, at: 0, leaves: LEAVES },
} satisfies Meta<typeof MerkleSumTree>;

export default meta;
type Story = StoryObj<typeof MerkleSumTree>;

/** Assembled and neutral — stake-weighted leaves, root on top. */
export const Assembled: Story = {
  args: { rootLabel: "root · Σ 1000" },
};

/** The ripple — leaf #3's update hopping root-ward, siblings frosted. */
export const Ripple: Story = {
  args: {
    frame: 80,
    updateLeaf: 3,
    updateAt: 50,
    updateTo: 100,
    frostAt: 50,
    rootLabel: "root",
  },
};

/** After settlement — one leaf zeroed hollow, the tree carries on. */
export const Zeroed: Story = {
  args: { frame: 60, zeroed: [5], zeroAt: 40, rootLabel: "root · post-prune" },
};
