import type { Meta, StoryObj } from "@storybook/react-vite";

import { Copyable } from "./copyable";

const meta = {
  title: "Primitives/Copyable",
  component: Copyable,
  argTypes: {
    value: { control: "text" },
    head: { control: "number" },
    tail: { control: "number" },
  },
} satisfies Meta<typeof Copyable>;

export default meta;
type Story = StoryObj<typeof Copyable>;

/** Short values (≤ head + tail + 1 chars) render whole, no ellipsis. */
export const ShortValue: Story = {
  render: () => (
    <div className="flex items-center gap-6 text-sm">
      <span>
        Pool id: <Copyable value="JRY-7" />
      </span>
      <span>
        Exact fit: <Copyable value="abcdef9" />
      </span>
    </div>
  ),
};

/** Long values — the default case for addresses and hashes. */
export const LongValue: Story = {
  render: () => (
    <div className="flex flex-col gap-3 text-sm">
      <span>
        Wallet:{" "}
        <Copyable value="9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" />
      </span>
      <span>
        Custom window:{" "}
        <Copyable
          value="5Kb8k4vJm3nQ7wYt9ZpX2rL6dF8hN4qC1sB7gT0eV3aU"
          head={6}
          tail={6}
        />
      </span>
    </div>
  ),
};

/** The copy button cross-fades to a check for 1.5s, then resets. */
export const CopyFlow: Story = {
  render: () => (
    <div className="flex flex-col gap-2 text-sm">
      <span>
        Click the icon:{" "}
        <Copyable value="Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS" />
      </span>
      <p className="text-xs text-muted-foreground">
        Clicking copies the FULL value (not the shortened display), flashes a
        check for 1500ms, and never propagates the click to parents.
      </p>
    </div>
  ),
};
