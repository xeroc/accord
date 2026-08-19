import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "./input";
import { Field, FieldControl, FieldDescription, FieldLabel } from "./field";
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

/** Field wires the label, description, and ids — see Primitives/Field. */
export const WithLabel: Story = {
  render: () => (
    <Field className="max-w-sm">
      <FieldLabel>Evidence URI</FieldLabel>
      <FieldControl>
        <Input placeholder="ar://… or ipfs://…" />
      </FieldControl>
      <FieldDescription>
        Paste a permanent URI; court members fetch it on-chain.
      </FieldDescription>
    </Field>
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
