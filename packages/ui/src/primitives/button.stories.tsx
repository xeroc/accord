import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight, Plus, Trash2 } from "lucide-react";

import { Button } from "./button";

const meta = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "secondary", "ghost", "destructive", "link"],
    },
    size: {
      control: "select",
      options: [
        "default",
        "xs",
        "sm",
        "lg",
        "icon",
        "icon-xs",
        "icon-sm",
        "icon-lg",
      ],
    },
    disabled: { control: "boolean" },
    asChild: { control: "boolean" },
  },
  args: { children: "Button" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof Button>;

/** Every variant at the default size, side by side. */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="default">Default</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

/** Every variant × a representative size (sm) to catch padding regressions. */
export const VariantSizeMatrix: Story = {
  render: () => (
    <table className="text-sm">
      <tbody>
        {(["default", "sm", "lg"] as const).map((size) => (
          <tr key={size}>
            <td className="pr-4 font-mono text-xs text-muted-foreground align-middle">
              {size}
            </td>
            {(
              [
                "default",
                "outline",
                "secondary",
                "ghost",
                "destructive",
                "link",
              ] as const
            ).map((variant) => (
              <td key={variant} className="p-1.5">
                <Button variant={variant} size={size}>
                  {variant}
                </Button>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
};

/** Every size, text and icon flavors. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-end gap-3">
      <Button size="xs">XS</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon-xs" aria-label="Add tiny">
        <Plus data-icon="inline-start" />
      </Button>
      <Button size="icon-sm" aria-label="Add small">
        <Plus />
      </Button>
      <Button size="icon" aria-label="Add">
        <Plus />
      </Button>
      <Button size="icon-lg" aria-label="Add large">
        <Plus />
      </Button>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button>
        <Plus data-icon="inline-start" />
        New dispute
      </Button>
      <Button variant="outline">
        Continue
        <ArrowRight data-icon="inline-end" />
      </Button>
      <Button variant="destructive" size="icon" aria-label="Slash verdict">
        <Trash2 />
      </Button>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled>Default</Button>
      <Button variant="outline" disabled>
        Outline
      </Button>
      <Button variant="destructive" disabled>
        Destructive
      </Button>
      <Button variant="link" disabled>
        Link
      </Button>
    </div>
  ),
};

/** Icon-only buttons MUST carry an accessible name. */
export const IconOnly: Story = {
  name: "Icon only (with aria-label)",
  render: () => (
    <Button size="icon" variant="outline" aria-label="Copy dispute ID">
      <Plus />
    </Button>
  ),
};

/** asChild merges the button styles onto the child element (Slot). */
export const AsChild: Story = {
  render: () => (
    <Button asChild variant="outline">
      <a href="https://useaccord.com">Anchor that looks like a button</a>
    </Button>
  ),
};

/** Long labels must wrap or truncate gracefully, not blow out layouts. */
export const LongText: Story = {
  render: () => (
    <div className="flex max-w-96 flex-col gap-3">
      <Button>Submit final verdict with attached evidence bundle</Button>
      <Button variant="outline">
        An extremely verbose secondary action label that keeps going and going
      </Button>
    </div>
  ),
};
