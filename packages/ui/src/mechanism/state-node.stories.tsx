import type { Meta, StoryObj } from "@storybook/react-vite";

import { StateNode } from "./state-node";

const meta = {
  title: "Mechanism/StateNode",
  component: StateNode,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 240, step: 1 } },
    at: { control: { type: "number", min: 0 } },
    activeAt: { control: { type: "number", min: 0 } },
    settleAt: { control: { type: "number", min: 0 } },
  },
  args: { frame: 90, at: 0 },
} satisfies Meta<typeof StateNode>;

export default meta;
type Story = StoryObj<typeof StateNode>;

/** A lifecycle rail — one case walking Filed → Finalized. */
export const Rail: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <StateNode frame={90} label="Filed" at={0} activeAt={10} settleAt={30} />
      <StateNode frame={90} label="Drawn" at={4} activeAt={30} settleAt={52} />
      <StateNode frame={90} label="Committed" at={8} activeAt={52} settleAt={70} />
      <StateNode frame={90} label="Revealed" at={12} activeAt={70} settleAt={86} />
      <StateNode frame={90} label="Finalized" at={16} activeAt={86} />
    </div>
  ),
};

/** The ignition itself — amber pill, glow, ring mid-expansion. */
export const Igniting: Story = {
  args: { frame: 44, label: "Review", at: 0, activeAt: 40 },
};

/** The dim baseline — the whole map at rest, one node breathing. */
export const Baseline: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {["Created", "Drawn", "Review", "Commit", "Reveal", "Final", "Closed"].map((label, i) => (
        <StateNode key={label} frame={40} label={label} at={i * 3} />
      ))}
    </div>
  ),
};
