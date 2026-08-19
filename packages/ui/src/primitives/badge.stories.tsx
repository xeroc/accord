import type { Meta, StoryObj } from "@storybook/react-vite";

import { Badge } from "./badge";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline", "ghost", "link"],
    },
  },
  args: { children: "Badge" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof Badge>;

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge>default</Badge>
      <Badge variant="secondary">secondary</Badge>
      <Badge variant="destructive">destructive</Badge>
      <Badge variant="outline">outline</Badge>
      <Badge variant="ghost">ghost</Badge>
      <Badge variant="link">link</Badge>
    </div>
  ),
};

/** Real-world states the apps render badges for. */
export const DisputeStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge>Active</Badge>
      <Badge variant="secondary">Evidence</Badge>
      <Badge variant="destructive">Slashed</Badge>
      <Badge variant="outline">Draft</Badge>
    </div>
  ),
};
