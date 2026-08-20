import type { Meta, StoryObj } from "@storybook/react-vite";

import { TokenBadge } from "./token-tone";

const meta = {
  title: "Mechanism/TokenTone",
  component: TokenBadge,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 120, step: 1 } },
    tone: { control: { type: "select" }, options: ["stake", "fee"] },
    at: { control: { type: "number", min: 0 } },
  },
  args: { frame: 30, tone: "stake", amount: 1200, label: "stake", at: 0 },
} satisfies Meta<typeof TokenBadge>;

export default meta;
type Story = StoryObj<typeof TokenBadge>;

/** The two mints side by side — cool nearwhite stake, warm amber fee. */
export const Mints: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <TokenBadge frame={30} tone="stake" amount={1200} label="stake" />
      <TokenBadge frame={30} tone="fee" amount={25} label="fee" />
      <TokenBadge frame={30} tone="fee" amount={2} label="bond" />
    </div>
  ),
};

/** Mid-pop — the badge entering at its frame. */
export const PoppingIn: Story = {
  args: { frame: 4, tone: "fee", amount: 25, label: "fee", at: 0 },
};
