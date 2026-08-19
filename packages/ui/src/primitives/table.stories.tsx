import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Badge } from "./badge";

const meta = {
  title: "Primitives/Table",
  component: Table,
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof Table>;

const DISPUTES = [
  {
    address: "cordhVo…yKed",
    subaccord: "Truth Terminal",
    state: "Committed",
    round: 2,
    stake: "12,000 USDC",
  },
  {
    address: "9xQeW…3FsK",
    subaccord: "Canon Curated",
    state: "Revealing",
    round: 1,
    stake: "4,500 USDC",
  },
  {
    address: "GdV5r…obHe",
    subaccord: "Synod Escrow",
    state: "Finalized",
    round: 3,
    stake: "21,000 USDC",
  },
] as const;

function StateBadge({ state }: { state: string }): React.ReactElement {
  if (state === "Finalized") return <Badge variant="secondary">{state}</Badge>;
  if (state === "Revealing") return <Badge variant="outline">{state}</Badge>;
  return <Badge>{state}</Badge>;
}

/** The default read-only data table — header, zebra-less rows, hover state. */
export const Default: Story = {
  render: () => (
    <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Dispute</TableHead>
            <TableHead scope="col">Subaccord</TableHead>
            <TableHead scope="col">State</TableHead>
            <TableHead scope="col" className="text-right">
              Round
            </TableHead>
            <TableHead scope="col" className="text-right">
              Stake
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {DISPUTES.map((d) => (
            <TableRow key={d.address}>
              <TableCell className="font-mono">{d.address}</TableCell>
              <TableCell>{d.subaccord}</TableCell>
              <TableCell>
                <StateBadge state={d.state} />
              </TableCell>
              <TableCell className="text-right font-mono">{d.round}</TableCell>
              <TableCell className="text-right font-mono">{d.stake}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
};

/** Caption + footer rows for summary tables. */
export const WithCaptionAndFooter: Story = {
  render: () => (
    <Table>
      <TableCaption>Open disputes across all Subaccords</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Subaccord</TableHead>
          <TableHead scope="col" className="text-right">
            Open
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Truth Terminal</TableCell>
          <TableCell className="text-right font-mono">7</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Canon Curated</TableCell>
          <TableCell className="text-right font-mono">3</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right font-mono">10</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};

/** Column count exceeds the viewport — the container scrolls horizontally. */
export const ScrollsHorizontally: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile" },
  },
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          {["Address", "Filer", "Subaccord", "State", "Round", "Ruling"].map(
            (h) => (
              <TableHead key={h} scope="col">
                {h}
              </TableHead>
            ),
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-mono">cordhVo…yKed</TableCell>
          <TableCell className="font-mono">FkUAf…9uBp</TableCell>
          <TableCell>Truth Terminal</TableCell>
          <TableCell>Committed</TableCell>
          <TableCell className="font-mono">2</TableCell>
          <TableCell>—</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
