import type { Meta, StoryObj } from "@storybook/react-vite";

import { PanelLadder } from "./panel-ladder";

const meta = {
  title: "Mechanism/PanelLadder",
  component: PanelLadder,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 240, step: 1 } },
    at: { control: { type: "number", min: 0 } },
    stagger: { control: { type: "number", min: 8, max: 60 } },
  },
  args: { frame: 140, at: 0, stagger: 26 },
} satisfies Meta<typeof PanelLadder>;

export default meta;
type Story = StoryObj<typeof PanelLadder>;

/** The full ladder — 3·7·15·31 with bond prices underneath. */
export const FullLadder: Story = {
  args: { labels: ["×1 (B)", "×2 (2B)", "×4 (4B)", "×8 (8B)"] },
};

/** Still climbing — step 2 (15 dots) micro-cascading in. */
export const Climbing: Story = {
  args: { frame: 62 },
};

/** Just the clusters — no price chips (the B1 "3→7" beat composes
 *  MonoChip + PanelLadder side by side). */
export const Clusters: Story = {
  args: { frame: 200 },
};
