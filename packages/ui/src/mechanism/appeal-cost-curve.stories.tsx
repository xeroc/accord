import type { Meta, StoryObj } from "@storybook/react-vite";

import { AppealCostCurve } from "./appeal-cost-curve";

const meta = {
  parameters: { layout: "centered" },
  title: "Mechanism/AppealCostCurve",
  component: AppealCostCurve,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 240, step: 1 } },
    at: { control: { type: "number", min: 0 } },
    dur: { control: { type: "number", min: 10, max: 120 } },
  },
  args: { frame: 200, at: 60, dur: 51 },
} satisfies Meta<typeof AppealCostCurve>;

export default meta;
type Story = StoryObj<typeof AppealCostCurve>;

/** The full hero beat — curve drawn past the crossing, ✕ flashed. */
export const FullCurve: Story = {};

/** Mid-draw — slow crawl segment, prize line just landed. */
export const MidDraw: Story = {
  args: { frame: 90 },
};

/** The D3 pairing — overlay a default PanelLadder underneath yourself:
 * place it at left 88, floor on the baseline (local y = 330). */
export const WithLadder: Story = {
  args: { frame: 200, at: 112, dashAt: 62 },
};
