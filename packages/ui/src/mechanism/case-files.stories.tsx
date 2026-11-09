import type { Meta, StoryObj } from "@storybook/react-vite";

import { CaseFiles, CASE_FILES } from "./case-files";

const meta = {
  title: "Mechanism/CaseFiles",
  component: CaseFiles,
} satisfies Meta<typeof CaseFiles>;

export default meta;
type Story = StoryObj<typeof CaseFiles>;

/** Mid-loop — control bar grown, chain glitching, verdicts split. */
export const Live: Story = {
  args: { frame: 75, cases: CASE_FILES },
};

/** Frame 0 — the settled still reduced-motion visitors see. */
export const Settled: Story = {
  args: { frame: 0, cases: CASE_FILES },
};

/** Custom cases and caption. */
export const Custom: Story = {
  args: {
    frame: 120,
    cases: [
      { id: "01", type: "ESCROW", title: "The milestone was never accepted.", status: "OPEN", visual: "control" },
      { id: "02", type: "REGISTRY", title: "The listing was challenged.", status: "APPEALED", visual: "verdicts" },
    ],
    caption: "EVERY DISPUTE NEEDS A FORUM.",
  },
};
