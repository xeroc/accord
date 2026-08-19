import type * as React from "react";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel } from "./field";
import { Input } from "./input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Textarea } from "./textarea";

const meta = {
  title: "Primitives/Field",
  component: Field,
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof Field>;

export const Default: Story = {
  render: (): React.ReactElement => (
    <Field className="max-w-sm">
      <FieldLabel>Evidence URI</FieldLabel>
      <FieldControl>
        <Input placeholder="ar://… or ipfs://…" />
      </FieldControl>
      <FieldDescription>Paste a permanent URI; court members fetch it on-chain.</FieldDescription>
    </Field>
  ),
};

export const InvalidWithDescriptionAndError: Story = {
  render: (): React.ReactElement => (
    <Field className="max-w-sm" invalid>
      <FieldLabel>Option salt</FieldLabel>
      <FieldControl>
        <Input defaultValue="0xdeadbeef" />
      </FieldControl>
      <FieldDescription>32-byte hex; hashes each option label.</FieldDescription>
      <FieldError>Must be 32 bytes (64 hex chars).</FieldError>
    </Field>
  ),
};

/** A full form: FieldGroup stacks fields at the standard gap. */
export const FormGroup: Story = {
  render: (): React.ReactElement => {
    const [invalid, setInvalid] = useState(false);

    return (
      <FieldGroup className="max-w-md">
        <Field invalid={invalid}>
          <FieldLabel>Dispute title</FieldLabel>
          <FieldControl>
            <Input placeholder="Breach of license terms" />
          </FieldControl>
          <FieldError>{invalid ? "Title is required." : null}</FieldError>
        </Field>

        <Field>
          <FieldLabel>Kind</FieldLabel>
          <FieldControl>
            <Select>
              <SelectTrigger className="w-full" aria-label="Dispute kind">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="binary">Binary</SelectItem>
                <SelectItem value="scalar">Scalar</SelectItem>
              </SelectContent>
            </Select>
          </FieldControl>
          <FieldDescription>Binary picks an option; scalar votes a number.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Notes</FieldLabel>
          <FieldControl>
            <Textarea rows={4} placeholder="Context for the jurors" />
          </FieldControl>
        </Field>

        <button
          type="button"
          className="w-fit text-xs text-muted-foreground underline"
          onClick={() => setInvalid((v) => !v)}
        >
          toggle title error
        </button>
      </FieldGroup>
    );
  },
};
