import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Spinner } from "./spinner";
import { Button } from "./button";

const meta = {
  title: "Primitives/Spinner",
  component: Spinner,
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof Spinner>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Spinner className="size-3" />
      <Spinner />
      <Spinner className="size-6" />
      <Spinner className="size-8" />
    </div>
  ),
};

/** The one true pending button — never hand-roll Loader2Icon + animate-spin. */
function PublishButton(): React.ReactElement {
  const [loading, setLoading] = useState(false);
  return (
    <Button loading={loading} onClick={() => {
      setLoading(true);
      setTimeout(() => setLoading(false), 1500);
    }}>
      Publish dispute
    </Button>
  );
}

export const InButton: Story = {
  render: () => <PublishButton />,
};
