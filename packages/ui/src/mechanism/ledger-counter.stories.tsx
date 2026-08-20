import type { Meta, StoryObj } from "@storybook/react-vite";

import { LedgerCounter } from "./ledger-counter";

const meta = {
  title: "Mechanism/LedgerCounter",
  component: LedgerCounter,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 120, step: 1 } },
    at: { control: { type: "number", min: 0 } },
    dur: { control: { type: "number", min: 4, max: 30 } },
    tone: { control: { type: "select" }, options: ["confirm", "slash", "amber", "neutral"] },
  },
  args: { frame: 30, at: 0, dur: 12, tone: "neutral" },
} satisfies Meta<typeof LedgerCounter>;

export default meta;
type Story = StoryObj<typeof LedgerCounter>;

/** A juror's mini-ledger — fees earned up, stake slashed down. */
export const JurorLedger: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-1">
      <LedgerCounter frame={30} label="staked" from={100} to={60} at={0} tone="slash" />
      <LedgerCounter frame={30} label="fees_earned" from={0} to={25} at={2} tone="confirm" />
      <LedgerCounter frame={30} label="active_draws" from={1} to={0} at={4} tone="amber" />
    </div>
  ),
};

/** The slash moment — red row flash mid-decay, number mid-tick. */
export const SlashFlash: Story = {
  args: { frame: 3, label: "staked", from: 100, to: 60, tone: "slash" },
};

/** Static rows — pre-event ledgers sitting in a card. */
export const Static: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-1">
      <LedgerCounter frame={0} label="staked" to={100} />
      <LedgerCounter frame={0} label="pending_withdrawal" to={0} />
    </div>
  ),
};
