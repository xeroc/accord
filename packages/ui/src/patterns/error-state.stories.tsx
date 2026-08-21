import type { Meta, StoryObj } from "@storybook/react-vite";

import { ErrorState } from "./error-state";

const meta = {
  title: "Patterns/ErrorState",
  component: ErrorState,
  parameters: {
    docs: {
      description: {
        component:
          "Read-failure panel: dashed EmptyState with a mono message and a Retry button (kit Button — press, focus, and loading states included).",
      },
    },
  },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof ErrorState>;

/** Default title + retry label. */
export const Default: Story = {
  args: { message: "404 Not Found", onRetry: () => {} },
};

/** Custom title + retry label (e.g. publish failures). */
export const CustomLabels: Story = {
  render: () => (
    <ErrorState
      title="Publish failed."
      retryLabel="Try again."
      message="daemon unreachable"
      onRetry={() => {}}
    />
  ),
};
