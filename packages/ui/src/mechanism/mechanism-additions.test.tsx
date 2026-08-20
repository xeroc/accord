import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TokenBadge, TOKEN_TONE } from "./token-tone";
import { ChainStrip } from "./chain-strip";
import { SubaccordCard, SUBACCORD_INTERNALS } from "./subaccord-card";
import { VaultBox } from "./vault-box";
import { LedgerCounter } from "./ledger-counter";
import { PanelLadder, PANEL_LADDER } from "./panel-ladder";
import { StateNode } from "./state-node";
import { MerkleSumTree } from "./merkle-sum-tree";
import { SortitionRuler } from "./sortition-ruler";

describe("TokenTone", () => {
  it("maps the two mints to the palette classes", () => {
    expect(TOKEN_TONE.stake).toMatchObject({
      text: "text-nearwhite",
      bg: "bg-nearwhite/10",
      border: "border-nearwhite/40",
    });
    expect(TOKEN_TONE.fee).toMatchObject({
      text: "text-amber",
      bg: "bg-amber/10",
      border: "border-amber/50",
    });
  });

  it("TokenBadge renders amount + label and pops in from its frame", () => {
    const { container, rerender } = render(
      <TokenBadge frame={5} tone="fee" amount={25} label="fee" at={10} />,
    );
    const badge = container.querySelector("[data-badge]") as HTMLElement;
    expect(badge.style.opacity).toBe("0");

    rerender(<TokenBadge frame={30} tone="fee" amount={25} label="fee" at={10} />);
    expect(badge.style.opacity).toBe("1");
    expect(badge.textContent).toContain("25");
    expect(badge.textContent).toContain("fee");
    expect(badge).toHaveClass("border-amber/50", "bg-amber/10", "text-amber");
  });
});

describe("ChainStrip", () => {
  it("renders one cell per slot, invisible until its append frame", () => {
    const { container } = render(
      <ChainStrip frame={10} cells={["a", "b", "c"]} appendAt={(i) => i * 18} />,
    );
    const cells = container.querySelectorAll("[data-cell]");
    expect(cells.length).toBe(3);
    expect((cells[0] as HTMLElement).style.opacity).toBe("1");
    expect((cells[1] as HTMLElement).style.opacity).toBe("0");
  });

  it("types the label on glyph-by-glyph when typePerChar is set", () => {
    const { container, rerender } = render(
      <ChainStrip frame={7} cells={["abcdef"]} typePerChar={2} />,
    );
    const label = (id: string) =>
      (container.querySelector(`[data-cell-label="${id}"]`) as HTMLElement).textContent;
    expect(label("0")).toBe("abc");

    rerender(<ChainStrip frame={30} cells={["abcdef"]} typePerChar={2} />);
    expect(label("0")).toBe("abcdef");
  });

  it("highlights the hash cell with the amber classes", () => {
    const { container } = render(
      <ChainStrip frame={60} cells={["slot", "a3f9c2d1"]} highlight={1} highlightAt={40} />,
    );
    const hash = container.querySelector('[data-cell="1"]') as HTMLElement;
    expect(hash).toHaveClass("border-amber/60", "bg-amber/10", "text-amber");
  });
});

describe("SubaccordCard", () => {
  it("cascades one row per internal at the stagger", () => {
    const { container, rerender } = render(
      <SubaccordCard frame={10} title="Subaccord A" internals={SUBACCORD_INTERNALS} />,
    );
    const rows = container.querySelectorAll("[data-internal]");
    expect(rows.length).toBe(5);
    expect((rows[4] as HTMLElement).style.opacity).toBe("0");

    rerender(<SubaccordCard frame={60} title="Subaccord A" internals={SUBACCORD_INTERNALS} />);
    expect((container.querySelectorAll("[data-internal]")[4] as HTMLElement).style.opacity).toBe("1");
  });

  it("the canonical set names the five owned things", () => {
    expect(SUBACCORD_INTERNALS.map((r) => r.label)).toEqual([
      "stake vault",
      "fee vault",
      "accumulator root",
      "evidence operator",
      "authority",
    ]);
  });

  it("collapsed renders no internals, ghost layers, and muted chorus styling", () => {
    const { container } = render(
      <SubaccordCard frame={30} title="Subaccord B" internals={SUBACCORD_INTERNALS} collapsed />,
    );
    expect(container.querySelectorAll("[data-internal]").length).toBe(0);
    expect(container.querySelectorAll("[data-ghost]").length).toBe(2);
    expect(screen.getByText("Subaccord B")).toHaveClass("text-muted-foreground");
    expect(screen.getByText("⋮ many")).toBeInTheDocument();
  });
});

describe("VaultBox", () => {
  it("counts the balance up from `from` and lands exactly", () => {
    const { container, rerender } = render(
      <VaultBox frame={6} label="stake_vault" token="stake" from={1000} balance={1020} tickAt={0} />,
    );
    const mid = Number(
      (container.querySelector("[data-balance]") as HTMLElement).textContent?.replace(/,/g, ""),
    );
    expect(mid).toBeGreaterThan(1000);
    expect(mid).toBeLessThan(1020);

    rerender(
      <VaultBox frame={20} label="stake_vault" token="stake" from={1000} balance={1020} tickAt={0} />,
    );
    expect(screen.getByText("1,020")).toBeInTheDocument();
  });

  it("renders stacked sub-counters beneath the fee balance", () => {
    render(
      <VaultBox
        frame={30}
        label="fee_vault"
        token="fee"
        balance={354}
        subCounters={[
          { label: "fee_paid", value: 125 },
          { label: "bonds", value: 96 },
        ]}
      />,
    );
    expect(screen.getByText("fee_paid")).toBeInTheDocument();
    expect(screen.getByText("125")).toBeInTheDocument();
    expect(screen.getByText("bonds")).toBeInTheDocument();
  });

  it("the unchanged badge appears only from its frame", () => {
    const { container, rerender } = render(
      <VaultBox frame={10} label="stake_vault" token="stake" balance={1000} unchangedAt={20} />,
    );
    expect((container.querySelector("[data-unchanged]") as HTMLElement).style.opacity).toBe("0");

    rerender(
      <VaultBox frame={30} label="stake_vault" token="stake" balance={1000} unchangedAt={20} />,
    );
    expect(container.querySelector("[data-unchanged]")).not.toBeNull();
    expect(screen.getByText("unchanged")).toBeInTheDocument();
  });
});

describe("LedgerCounter", () => {
  it("counts from → to on the tick and flashes the row", () => {
    const { container, rerender } = render(
      <LedgerCounter frame={2} label="staked" from={100} to={60} at={0} tone="slash" />,
    );
    expect(container.querySelector("[data-flash]")).not.toBeNull();

    rerender(<LedgerCounter frame={20} label="staked" from={100} to={60} at={0} tone="slash" />);
    expect(container.querySelector("[data-flash]")).toBeNull();
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByText("60")).toHaveClass("text-slash");
  });

  it("a static row (no from) shows `to` with no flash", () => {
    const { container } = render(<LedgerCounter frame={10} label="staked" to={100} />);
    expect(container.querySelector("[data-flash]")).toBeNull();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("counts down to zero for active_draws", () => {
    render(<LedgerCounter frame={20} label="active_draws" from={1} to={0} at={0} tone="amber" />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("PanelLadder", () => {
  it("is the appeal ladder 3·7·15·31", () => {
    expect(PANEL_LADDER).toEqual([3, 7, 15, 31]);
  });

  it("renders one dot cluster per step with the right counts", () => {
    const { container } = render(<PanelLadder frame={200} />);
    const steps = container.querySelectorAll("[data-step]");
    expect(steps.length).toBe(4);
    for (const count of PANEL_LADDER) {
      const idx = PANEL_LADDER.indexOf(count);
      expect(
        container.querySelectorAll(`[data-step="${idx}"] [data-dot]`).length,
      ).toBe(count);
    }
  });

  it("dots stay invisible until their step rises", () => {
    const { container } = render(<PanelLadder frame={10} at={0} stagger={26} />);
    const firstDot = container.querySelector('[data-step="0"] [data-dot]') as HTMLElement;
    const lastDot = container.querySelector('[data-step="3"] [data-dot]') as HTMLElement;
    // step 0 (at=0, dur=12): mid-entrance → visible but not settled
    expect(firstDot.style.opacity).not.toBe("0");
    // step 3 (at=78) has not started
    expect(lastDot.style.opacity).toBe("0");
  });

  it("labels land under their steps once risen", () => {
    render(<PanelLadder frame={200} labels={["×1 (B)", "×2 (2B)", "×4 (4B)", "×8 (8B)"]} />);
    expect(screen.getByText("×8 (8B)")).toBeInTheDocument();
  });
});

describe("StateNode", () => {
  it("rests at the dim baseline before ignition", () => {
    const { container } = render(<StateNode frame={30} label="Created" />);
    const pill = container.querySelector("[data-node='Created'] [data-state]") as HTMLElement;
    expect(pill.dataset.state).toBe("dim");
    expect(pill).toHaveClass("border-border-subtle", "bg-raised/40", "text-muted-foreground");
    expect(container.querySelector("[data-ring]")).toBeNull();
  });

  it("ignites amber with an expanding ring from activeAt", () => {
    const { container } = render(<StateNode frame={45} label="Review" activeAt={40} />);
    const pill = container.querySelector("[data-node='Review'] [data-state]") as HTMLElement;
    expect(pill.dataset.state).toBe("active");
    expect(pill).toHaveClass("border-amber/60", "bg-amber/10", "text-amber");
    expect(container.querySelector("[data-ring]")).not.toBeNull();
  });

  it("relaxes to the visited state at settleAt", () => {
    const { container } = render(
      <StateNode frame={90} label="Filed" activeAt={10} settleAt={70} />,
    );
    const pill = container.querySelector("[data-node='Filed'] [data-state]") as HTMLElement;
    expect(pill.dataset.state).toBe("visited");
    expect(pill).toHaveClass("border-confirm/30");
    expect(container.querySelector("[data-ring]")).toBeNull();
  });
});

describe("MerkleSumTree", () => {
  const LEAVES = [120, 80, 140, 60, 200, 160, 90, 150];

  it("builds the full node set: 8 leaves, 7 internal nodes, 14 edges", () => {
    const { container } = render(<MerkleSumTree frame={60} leaves={LEAVES} />);
    expect(container.querySelectorAll("[data-leaf]").length).toBe(8);
    expect(container.querySelectorAll("[data-node]").length).toBe(7);
    expect(container.querySelectorAll("[data-edge]").length).toBe(14);
  });

  it("leaf widths are proportional to stake", () => {
    const { container } = render(<MerkleSumTree frame={60} leaves={[100, 300]} width={228} />);
    const bars = [
      container.querySelector('[data-leaf="0"] > div') as HTMLElement,
      container.querySelector('[data-leaf="1"] > div') as HTMLElement,
    ];
    const w0 = Number.parseFloat((bars[0] as HTMLElement).style.width);
    const w1 = Number.parseFloat((bars[1] as HTMLElement).style.width);
    expect(w1).toBeGreaterThan(w0 * 2);
  });

  it("the ripple reaches the root on its final hop", () => {
    const { container, rerender } = render(
      <MerkleSumTree frame={65} leaves={LEAVES} updateLeaf={3} updateAt={30} hopDur={10} />,
    );
    // root is the last node; path = leaf 3 → pair → half → root (hop 3 at 60).
    const root = container.querySelector('[data-node="14"]') as HTMLElement;
    expect(root.style.borderColor).toBe("var(--accord-amber)");

    rerender(<MerkleSumTree frame={40} leaves={LEAVES} updateLeaf={3} updateAt={30} hopDur={10} />);
    const rootEarly = container.querySelector('[data-node="14"]') as HTMLElement;
    expect(rootEarly.style.borderColor).toBe("var(--accord-border)");
  });

  it("off-path leaves frost out during the update", () => {
    const { container } = render(
      <MerkleSumTree frame={60} leaves={LEAVES} updateLeaf={3} updateAt={30} hopDur={10} frostAt={30} />,
    );
    const offPath = container.querySelector('[data-leaf="0"] > div') as HTMLElement;
    const onPath = container.querySelector('[data-leaf="3"] > div') as HTMLElement;
    expect(Number(offPath.style.opacity)).toBeLessThan(0.5);
    expect(Number(onPath.style.opacity)).toBeGreaterThan(0.9);
  });

  it("zeroed leaves drain hollow with a 0", () => {
    const { container, rerender } = render(
      <MerkleSumTree frame={20} leaves={LEAVES} zeroed={[5]} zeroAt={40} />,
    );
    expect((screen.getByText("0") as HTMLElement).style.opacity).toBe("0");

    rerender(<MerkleSumTree frame={60} leaves={LEAVES} zeroed={[5]} zeroAt={40} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    const bar = container.querySelector('[data-leaf="5"] > div') as HTMLElement;
    expect(bar.textContent).toBe("0");
  });
});

describe("SortitionRuler", () => {
  const STAKES = [120, 80, 450, 250, 100];

  it("lays segments out proportional to stake", () => {
    const { container } = render(
      <SortitionRuler frame={60} stakes={STAKES} labels={["P", "Q", "R", "S", "T"]} width={508} />,
    );
    const segs = Array.from(container.querySelectorAll("[data-seg]")) as HTMLElement[];
    expect(segs.length).toBe(5);
    // usable = 508 − 2·4 = 500; the 450/1000 share is 225 px.
    expect(Number.parseFloat((segs[2] as HTMLElement).style.width)).toBeCloseTo(225, 0);
    expect(Number.parseFloat((segs[1] as HTMLElement).style.width)).toBeCloseTo(40, 0);
    expect(screen.getByText("total_stake")).toBeInTheDocument();
  });

  it("the dart is hidden until the throw and lands with its needle", () => {
    const { container, rerender } = render(
      <SortitionRuler frame={50} stakes={STAKES} dartR={290} dartAt={70} throwFrom={0} />,
    );
    expect(container.querySelector("[data-dart]")).toBeNull();

    rerender(<SortitionRuler frame={90} stakes={STAKES} dartR={290} dartAt={70} throwFrom={0} />);
    expect(container.querySelector("[data-dart]")).not.toBeNull();
    expect(container.querySelector("[data-needle]")).not.toBeNull();
  });

  it("the winner segment tint-sweeps to full", () => {
    const { container } = render(
      <SortitionRuler frame={90} stakes={STAKES} dartR={290} dartAt={70} winner={2} winAt={74} />,
    );
    const sweep = container.querySelector("[data-win-sweep]") as HTMLElement;
    expect(sweep.style.width).toBe("100%");
  });

  it("drawn segments take the exclusion hatch from drawnAt", () => {
    const { container, rerender } = render(
      <SortitionRuler frame={100} stakes={STAKES} drawn={[2]} drawnAt={110} />,
    );
    const hatchEarly = container.querySelector("[data-hatch]") as HTMLElement;
    expect(hatchEarly.style.opacity).toBe("0");

    rerender(<SortitionRuler frame={150} stakes={STAKES} drawn={[2]} drawnAt={110} />);
    const hatch = container.querySelector("[data-hatch]") as HTMLElement;
    expect(hatch.style.opacity).toBe("1");
    expect(hatch.style.background).toContain("repeating-linear-gradient");
  });
});
