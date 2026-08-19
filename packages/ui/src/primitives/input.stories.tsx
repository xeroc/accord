import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "./input";
import { Button } from "./button";

const meta = {
  title: "Primitives/Input",
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { placeholder: "Dispute title" },
};

export const States: Story = {
  render: () => (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <Input placeholder="With placeholder" aria-label="Placeholder demo" />
      <Input defaultValue="Prefilled value" aria-label="Prefilled" />
      <Input disabled value="Disabled" aria-label="Disabled" />
      <Input
        aria-invalid
        placeholder="Invalid (aria-invalid)"
        aria-label="Invalid"
      />
    </div>
  ),
};

/** Inputs inherit form font styles for file inputs; labels stay app-owned. */
export const WithLabel: Story = {
  render: () => (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <label htmlFor="evidence-uri" className="text-sm font-medium">
        Evidence URI
      </label>
      <Input id="evidence-uri" placeholder="ar://… or ipfs://…" />
      <p className="text-xs text-muted-foreground">
        Paste a permanent URI; court members fetch it on-chain.
      </p>
    </div>
  ),
};

export const FormRow: Story = {
  render: () => (
    <form className="flex w-full max-w-md items-end gap-2">
      <Input placeholder="Search disputes…" aria-label="Search" className="flex-1" />
      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  ),
};
