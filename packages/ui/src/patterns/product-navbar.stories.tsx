import type { Meta, StoryObj } from "@storybook/react-vite";

import { ProductNavbar } from "./product-navbar";
import { Button } from "../primitives/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../primitives/select";

const meta = {
  title: "Patterns/ProductNavbar",
  component: ProductNavbar,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Sticky top-bar shell (blur + hairline, IBM Plex Mono). Slot-based: apps pass their own brand link, nav, and wallet/cluster controls — the kit owns only the header chrome. No router or wallet imports here.",
      },
    },
  },
} satisfies Meta<typeof ProductNavbar>;

export default meta;
type Story = StoryObj<typeof ProductNavbar>;

/** Inline fixture brand — apps pass their `<Link>`-wrapped wordmark. */
function Brand({ name }: { name: string }) {
  return (
    <a href="#" className="flex items-center gap-2 text-foreground">
      <span aria-hidden className="text-lg" style={{ color: "var(--amber)" }}>
        ◇
      </span>
      <span className="text-lg font-bold tracking-tight">{name}</span>
    </a>
  );
}

/** All slots: brand left, nav + account controls right. */
export const FullBar: Story = {
  render: () => (
    <ProductNavbar
      brand={<Brand name="ACCORD" />}
      navigation={
        <nav className="flex items-center gap-3 text-sm">
          <a href="#" className="text-muted-foreground hover:text-foreground">
            Disputes
          </a>
          <a href="#" className="text-muted-foreground hover:text-foreground">
            Subaccords
          </a>
        </nav>
      }
      accountControls={
        <>
          <Select value="devnet" onValueChange={() => {}}>
            <SelectTrigger className="w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="devnet">Devnet</SelectItem>
              <SelectItem value="mainnet">Mainnet</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm">Connect wallet.</Button>
        </>
      }
    />
  ),
};

/** Connected state: shortened address + disconnect, no nav. */
export const ConnectedNoNav: Story = {
  render: () => (
    <ProductNavbar
      brand={<Brand name="CANON" />}
      accountControls={
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">9WzD…AWWM</span>
          <Button variant="outline" size="sm">
            Disconnect
          </Button>
        </div>
      }
    />
  ),
};

/** Empty accountControls — brand-only bar (pre-connect, no chrome). */
export const BrandOnly: Story = {
  render: () => <ProductNavbar brand={<Brand name="SYNOD" />} />,
};
