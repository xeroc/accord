import type { Meta, StoryObj } from "@storybook/react-vite";

import { DeltaChip, MonoChip } from "./chips";

const meta = {
  title: "Mechanism/Chips",
  component: MonoChip,
  argTypes: {
    tone: {
      control: "select",
      options: ["amber", "confirm", "slash", "neutral"],
    },
  },
} satisfies Meta<typeof MonoChip>;

export default meta;
type Story = StoryObj<typeof MonoChip>;

/** All four tones at chip scale — the mono pill vocabulary. */
export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <MonoChip tone="amber">commit 0x6f3a91</MonoChip>
      <MonoChip tone="confirm">coherent</MonoChip>
      <MonoChip tone="slash">slashed</MonoChip>
      <MonoChip tone="neutral">was the work delivered?</MonoChip>
    </div>
  ),
};

/** Delta chips — fees earned and stake moved, popped in. */
export const Deltas: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <DeltaChip tone="amber" sign="+" amount={25} label="fee" pop={1} />
      <DeltaChip tone="confirm" sign="+" amount={10} label="stake" pop={1} />
      <DeltaChip tone="slash" sign="−" amount={40} label="stake" pop={1} />
    </div>
  ),
};

/** Pill and card scale overrides via className. */
export const Scales: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <MonoChip tone="amber" className="border-amber/40 px-6 py-2.5 text-sm">
        filing fee · 125
      </MonoChip>
      <MonoChip tone="neutral" className="rounded-lg px-6 py-3 text-2xl">
        should this claim pay?
      </MonoChip>
    </div>
  ),
};
