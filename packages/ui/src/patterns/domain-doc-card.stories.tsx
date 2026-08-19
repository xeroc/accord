import type { Meta, StoryObj } from "@storybook/react-vite";

import { DOMAIN_DOC_TEMPLATE, DomainDocCard } from "./domain-doc-card";

const meta = {
  title: "Patterns/DomainDocCard",
  component: DomainDocCard,
} satisfies Meta<typeof DomainDocCard>;

export default meta;
type Story = StoryObj<typeof DomainDocCard>;

const OK_DOC = {
  status: "ok" as const,
  title: "List Rules",
  description: "What belongs on this list — and what does not",
  body: "## Rules\n\n1. Item must be **verifiable** from a public source.\n2. No self-promotion.\n3. Challenges cite the broken rule.",
  raw: "---\ntitle: List Rules\ndescription: What belongs on this list — and what does not\n---\n\n## Rules\n\n1. Item must be **verifiable** from a public source.\n2. No self-promotion.\n3. Challenges cite the broken rule.\n",
};

export const Ok: Story = {
  render: () => (
    <div className="max-w-lg">
      <DomainDocCard doc={OK_DOC} hash={"a".repeat(64)} />
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="max-w-lg">
      <DomainDocCard doc={{ status: "loading" }} hash={"a".repeat(64)} />
    </div>
  ),
};

export const Missing: Story = {
  render: () => (
    <div className="max-w-lg">
      <DomainDocCard
        doc={{ status: "missing" }}
        hash={"a".repeat(64)}
        retry={
          <button type="button" className="text-sm underline">
            Publish the document now →
          </button>
        }
      />
    </div>
  ),
};

export const Tampered: Story = {
  render: () => (
    <div className="max-w-lg">
      <DomainDocCard doc={{ status: "tampered" }} hash={"a".repeat(64)} />
    </div>
  ),
};

export const Editable: Story = {
  render: () => (
    <div className="max-w-lg space-y-6">
      <DomainDocCard
        editable
        value={DOMAIN_DOC_TEMPLATE}
        onValueChange={() => {}}
      />
      <DomainDocCard
        editable={false}
        value={DOMAIN_DOC_TEMPLATE}
        onValueChange={() => {}}
      />
    </div>
  ),
};
