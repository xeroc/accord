import type * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Textarea } from "./textarea";
import { Field, FieldControl, FieldDescription, FieldError, FieldLabel } from "./field";

const meta = {
  title: "Primitives/Textarea",
  component: Textarea,
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: { placeholder: "Evidence manifest (accord-evidence/v1)" },
};

export const States: Story = {
  render: () => (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <Textarea aria-label="Plain" placeholder="With placeholder" />
      <Textarea aria-label="Prefilled" defaultValue={"# Accord evidence\n\nv1"} />
      <Textarea aria-label="Disabled" disabled defaultValue="Disabled" />
      <Textarea aria-label="Invalid" aria-invalid placeholder="Invalid (aria-invalid)" />
    </div>
  ),
};

/** The canonical composition: Field wires label, description, and error. */
export const InField: Story = {
  render: (): React.ReactElement => (
    <Field className="max-w-sm">
      <FieldLabel>Manifest</FieldLabel>
      <FieldControl>
        <Textarea placeholder="# Accord evidence" rows={6} />
      </FieldControl>
      <FieldDescription>Multi-line; the editor prefills a v1 skeleton.</FieldDescription>
      <FieldError>Manifest must be valid JSON front-matter.</FieldError>
    </Field>
  ),
};
