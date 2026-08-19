import type { Meta, StoryObj } from "@storybook/react-vite";

import { DisputeStatusCard } from "./dispute-status-card";

const meta = {
  title: "Patterns/DisputeStatusCard",
  component: DisputeStatusCard,
  parameters: {
    docs: {
      description: {
        component:
          "Display-only dispute status panel (section + h3 + dl rows + footer). Apps decode the on-chain Dispute account, format values, and build the deep link; this module renders pure data with zero SDK or env imports.",
      },
    },
  },
} satisfies Meta<typeof DisputeStatusCard>;

export default meta;
type Story = StoryObj<typeof DisputeStatusCard>;

/** Live dispute — ruling pending, no finalized row. */
export const PendingDispute: Story = {
  render: () => (
    <DisputeStatusCard
      title="Backing dispute"
      rows={[
        { label: "Dispute", value: "9WzD…AWWM" },
        { label: "State", value: "Live" },
        { label: "Round", value: 2 },
        { label: "Ruling", value: "pending" },
        { label: "Filed", value: "2026-08-12 14:02" },
      ]}
      note={
        <p
          className="italic text-muted-foreground"
          style={{ margin: "0.5rem 0 0", fontSize: "0.8rem" }}
        >
          Once final, a cranker&rsquo;s settle applies the ruling here.
        </p>
      }
    />
  ),
};

/** Final dispute — finalized row + deep-link action. */
export const FinalDisputeWithAction: Story = {
  render: () => (
    <DisputeStatusCard
      title="Backing dispute"
      rows={[
        { label: "Dispute", value: "Fg6P…sLnS" },
        { label: "State", value: "Final" },
        { label: "Round", value: 3 },
        { label: "Ruling", value: "keep" },
        { label: "Filed", value: "2026-08-10 09:31" },
        { label: "Finalized", value: "2026-08-12 22:47" },
      ]}
      action={
        <a
          href="https://accord.example/#/disputes/Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          style={{
            display: "inline-block",
            marginTop: "0.75rem",
            color: "var(--amber)",
          }}
        >
          Open in Accord →
        </a>
      }
    />
  ),
};

/** No deep link configured — fallback note only, no action. */
export const NoteOnlyFallback: Story = {
  render: () => (
    <DisputeStatusCard
      title="Backing dispute"
      rows={[{ label: "State", value: "Live" }]}
      note={
        <p
          className="italic text-muted-foreground"
          style={{ margin: "0.75rem 0 0", fontSize: "0.8rem" }}
        >
          Set VITE_ACCORD_APP_URL to enable a deep link to the Accord dApp.
        </p>
      }
    />
  ),
};
