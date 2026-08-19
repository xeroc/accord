import type * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

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

function TestTable({ caption }: { caption?: string }): React.ReactElement {
  return (
    <Table aria-label="Disputes">
      {caption ? <TableCaption>{caption}</TableCaption> : null}
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Address</TableHead>
          <TableHead scope="col">State</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>cord1…Ked</TableCell>
          <TableCell>Committed</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>1 dispute</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

describe("Table", () => {
  it("renders the full semantic table structure", () => {
    render(<TestTable />);
    const table = screen.getByRole("table", { name: "Disputes" });
    // Semantic sections exist inside the (scroll-container-wrapped) table.
    expect(table.querySelector("thead")).not.toBeNull();
    expect(table.querySelector("tbody")).not.toBeNull();
    expect(table.querySelector("tfoot")).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Address" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "Committed" })).toBeVisible();
  });

  it("wraps the table in a horizontal-scroll container", () => {
    const { container } = render(<TestTable />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute("data-slot")).toBe("table-container");
    expect(wrapper.className).toContain("overflow-x-auto");
    expect(wrapper.tagName).toBe("DIV");
    expect(wrapper.querySelector("table")).not.toBeNull();
  });

  it("renders a caption when provided", () => {
    render(<TestTable caption="Open disputes" />);
    expect(screen.getByRole("caption", { name: "Open disputes" })).toBeVisible();
  });

  it("merges custom classes onto every part (cn/tailwind-merge)", () => {
    render(
      <Table className="text-base" aria-label="x">
        <TableHeader>
          <TableRow className="ring-1">
            <TableHead scope="col" className="px-6">
              H
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="px-6">C</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole("table").className).toContain("text-base");
    expect(screen.getByRole("columnheader").className).toContain("px-6");
    expect(screen.getByRole("cell").className).toContain("px-6");
    // cn merge: the override must come AFTER the base p-2 so the px axis
    // wins the cascade (tailwind-merge keeps p-2 for the y axis on purpose).
    const cellClasses = screen.getByRole("cell").className.split(/\s+/);
    expect(cellClasses.indexOf("px-6")).toBeGreaterThan(
      cellClasses.indexOf("p-2"),
    );
  });
});
