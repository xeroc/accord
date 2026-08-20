import type { Meta, StoryObj } from "@storybook/react-vite";

import { EmptyState } from "./empty-state";
import { Button } from "../primitives/button";

const meta = {
  title: "Patterns/EmptyState",
  component: EmptyState,
  parameters: {
    docs: {
      description: {
        component:
          "Dashed placeholder panel for empty / no-access / blank states: title, optional description, optional action slot. The dashed border reads as \"nothing here yet\" against the solid raised cards.",
      },
    },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof EmptyState>;

/** Bare title only. */
export const Bare: Story = {
  args: { title: "No active jurors." },
};

/** Title + description — the common read-empty shape. */
export const WithDescription: Story = {
  args: {
    title: "No subaccords yet.",
    description: "Create the first pool. Stake jurors. File a dispute.",
  },
};

/** With an action — typically one primary button or link. */
export const WithAction: Story = {
  render: () => (
    <EmptyState
      title="Connect a wallet."
      description="Your stakes read from your connected wallet address."
      action={<Button>Browse subaccords.</Button>}
    />
  ),
};
