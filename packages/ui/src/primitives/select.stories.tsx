import type * as React from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

const meta = {
  title: "Primitives/Select",
  component: Select,
  tags: ["autodocs"],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof Select>;

function FrameworkSelect(props: {
  value?: string;
  onValueChange?: (v: string) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <Select {...props}>
      <SelectTrigger className="w-48" aria-label="Framework">
        <SelectValue placeholder="Pick a framework" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Frameworks</SelectLabel>
          <SelectItem value="react">React</SelectItem>
          <SelectItem value="solid">Solid</SelectItem>
          <SelectSeparator />
          <SelectItem value="svelte">Svelte</SelectItem>
          <SelectItem value="vue">Vue</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export const Default: Story = {
  render: () => <FrameworkSelect />,
};

/** Keyboard: focus trigger → ArrowDown opens → arrows move → Enter selects. */
export const KeyboardNavigation: Story = {
  name: "Keyboard navigation (arrows + enter)",
  render: () => <FrameworkSelect />,
  parameters: {
    docs: {
      description: {
        story:
          "Tab to the trigger, press ArrowDown to open, navigate with the arrow keys, confirm with Enter. Typeahead and Escape are wired by Radix.",
      },
    },
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <FrameworkSelect disabled />
      <p className="text-xs text-muted-foreground">
        Disabled triggers are inert and dimmed (50% opacity).
      </p>
    </div>
  ),
};

/** Long labels must truncate (line-clamp) instead of blowing the layout. */
export const LongLabels: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Select defaultValue="long">
        <SelectTrigger className="w-64" aria-label="Dispute category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="short">Smart contract</SelectItem>
          <SelectItem value="long">
            Escrow non-delivery — digital goods with on-chain attestation
          </SelectItem>
          <SelectItem value="longest">
            Freelance dispute — milestone rejection with partial delivery of
            the agreed specification
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

/** Controlled usage — trigger always reflects the current value. */
export const Controlled: Story = {
  render: () => <FrameworkSelect value="solid" onValueChange={() => {}} />,
};

/**
 * Long list — the exported scroll buttons bookend the viewport and appear
 * only while that direction is scrollable (SelectContent already mounts a
 * pair internally; this story exercises the exported API directly).
 */
export const ScrollableLongList: Story = {
  render: () => (
    <Select defaultValue="d-1">
      <SelectTrigger className="w-56" aria-label="Pick a dispute">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectScrollUpButton />
        {Array.from({ length: 20 }, (_, i) => (
          <SelectItem key={i} value={`d-${i + 1}`}>
            Dispute #{1043 - i}
          </SelectItem>
        ))}
        <SelectScrollDownButton />
      </SelectContent>
    </Select>
  ),
};
