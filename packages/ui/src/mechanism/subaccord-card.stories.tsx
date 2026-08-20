import type { Meta, StoryObj } from "@storybook/react-vite";

import { SubaccordCard, SUBACCORD_INTERNALS } from "./subaccord-card";

const meta = {
  title: "Mechanism/SubaccordCard",
  component: SubaccordCard,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 120, step: 1 } },
    at: { control: { type: "number", min: 0 } },
    stagger: { control: { type: "number", min: 1, max: 6 } },
  },
  args: { frame: 60, title: "Subaccord A", at: 0, stagger: 2 },
} satisfies Meta<typeof SubaccordCard>;

export default meta;
type Story = StoryObj<typeof SubaccordCard>;

/** The hero — five owned internals cascaded in, fully settled. */
export const Expanded: Story = {
  args: { internals: SUBACCORD_INTERNALS },
};

/** Mid-cascade — vault ① seated, the authority still rising. */
export const Cascading: Story = {
  args: { frame: 22, internals: SUBACCORD_INTERNALS },
};

/** The chorus — collapsed, dimmed, "many, permissionless". */
export const CollapsedStack: Story = {
  render: () => (
    <div className="flex items-start gap-8">
      <SubaccordCard frame={60} title="Subaccord A" internals={SUBACCORD_INTERNALS} />
      <div className="flex flex-col gap-4 pt-2">
        <SubaccordCard frame={70} title="Subaccord B" collapsed />
        <SubaccordCard frame={76} title="Subaccord C" collapsed />
      </div>
    </div>
  ),
};
