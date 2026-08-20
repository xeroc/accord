import type { Meta, StoryObj } from "@storybook/react-vite";

import { DepthPicker } from "./depth-picker";
import { useState } from "react";

const meta = {
  title: "Patterns/DepthPicker",
  component: DepthPicker,
  parameters: {
    docs: {
      description: {
        component:
          "Juror-seat capacity Select for create-flows that size an MST stake pool. The ladder trims to `maxDepth` (per-program tx-size bound, passed as a prop to keep the kit SDK-free); the highest available option is relabeled \"… — max\".",
      },
    },
  },
} satisfies Meta<typeof DepthPicker>;

export default meta;
type Story = StoryObj<typeof DepthPicker>;

function Demo({ maxDepth }: { maxDepth?: number }) {
  const [depth, setDepth] = useState("12");
  return <DepthPicker value={depth} onChange={setDepth} maxDepth={maxDepth} />;
}

/** Full ladder — Accord subaccords (MAX_SAFE_TREE_DEPTH = 16). */
export const FullLadder: Story = {
  render: () => <Demo />,
};

/** Trimmed ladder — Canon backing courts (MAX_LIST_TREE_DEPTH = 8). */
export const TrimmedToEight: Story = {
  render: () => <Demo maxDepth={8} />,
};
