import type { Meta, StoryObj } from "@storybook/react-vite";

import { Separator } from "./separator";

const meta = {
  title: "Primitives/Separator",
  component: Separator,
  tags: ["autodocs"],
  argTypes: {
    orientation: { control: "radio", options: ["horizontal", "vertical"] },
    decorative: { control: "boolean" },
  },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-full max-w-sm">
      <p className="text-sm">Above the separator</p>
      <Separator className="my-4" />
      <p className="text-sm">Below the separator</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-8 items-center gap-4 text-sm">
      <span>Stake</span>
      <Separator orientation="vertical" />
      <span>Deliberation</span>
      <Separator orientation="vertical" />
      <span>Verdict</span>
    </div>
  ),
};
