import type { Meta, StoryObj } from "@storybook/react-vite";

import { VaultBox } from "./vault-box";

const meta = {
  title: "Mechanism/VaultBox",
  component: VaultBox,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 120, step: 1 } },
    at: { control: { type: "number", min: 0 } },
    tickAt: { control: { type: "number", min: 0 } },
  },
  args: { frame: 60, at: 0, label: "stake_vault", token: "stake", balance: 1020 },
} satisfies Meta<typeof VaultBox>;

export default meta;
type Story = StoryObj<typeof VaultBox>;

/** Two mints, two vaults — the closed system at rest. */
export const TwoVaults: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      <VaultBox frame={60} label="stake_vault" token="stake" balance={1020} />
      <VaultBox
        frame={60}
        label="fee_vault"
        token="fee"
        balance={354}
        subCounters={[
          { label: "fee_paid", value: 125 },
          { label: "bonds", value: 96 },
        ]}
      />
    </div>
  ),
};

/** The stake ticks up 1000 → 1020 (an accumulator update landing). */
export const Ticking: Story = {
  args: { frame: 10, from: 1000, balance: 1020, tickAt: 0 },
};

/** The economics punchline — the vault does nothing but re-check. */
export const Unchanged: Story = {
  args: { frame: 40, balance: 1000, unchangedAt: 20 },
};
