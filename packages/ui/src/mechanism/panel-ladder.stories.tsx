import type { Meta, StoryObj } from "@storybook/react-vite";

import { PanelLadder } from "./panel-ladder";

const meta = {
  title: "Mechanism/PanelLadder",
  component: PanelLadder,
  parameters: { layout: "centered" },
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 240, step: 1 } },
    at: { control: { type: "number", min: 0 } },
    stagger: { control: { type: "number", min: 8, max: 60 } },
  },
  args: { frame: 140, at: 0, stagger: 26 },
} satisfies Meta<typeof PanelLadder>;

export default meta;
type Story = StoryObj<typeof PanelLadder>;

/** The full ladder — 3·7·15·31, panel sizes under the steps. */
export const FullLadder: Story = {
  args: { labels: ["3", "7", "15", "31"] },
};

/** Still climbing — step 2 (15 dots) micro-cascading in. */
export const Climbing: Story = {
  args: { frame: 62 },
};

/** Just the clusters — no size chips (compose MonoChip beside it). */
export const Clusters: Story = {
  args: { frame: 200 },
};
