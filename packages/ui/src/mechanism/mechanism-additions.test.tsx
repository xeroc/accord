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
import { AppealCostCurve } from "./appeal-cost-curve";
import { RetroBeam } from "./retro-beam";
import { DrawCommitReveal } from "./draw-commit-reveal";
import { DisputeFlow } from "./dispute-flow";
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

  it("orients the tree root-up: root above internals above leaves", () => {
    const { container } = render(<MerkleSumTree frame={60} leaves={LEAVES} />);
    const nodeTops = Array.from(container.querySelectorAll("[data-node]")).map((n) =>
      Number.parseFloat((n as HTMLElement).style.top),
    );
    const leafTops = Array.from(container.querySelectorAll("[data-leaf]")).map((n) =>
      Number.parseFloat((n as HTMLElement).style.top),
    );
    // the root is the single topmost node (rowsTop = 22), strictly above
    // every other internal node, and every leaf sits below them all
    const rootTop = Math.min(...nodeTops);
    expect(nodeTops.filter((t) => t === rootTop).length).toBe(1);
    expect(nodeTops.filter((t) => t > rootTop).length).toBe(6);
    expect(Math.max(...nodeTops)).toBeLessThan(Math.min(...leafTops));
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

  it("plays the collision story: pinned dart, dissolving dart, per-segment hatches", () => {
    const darts = [
      { r: 290, from: 0, pinAt: 70, throwAt: 92, landAt: 104 },
      { r: 538, from: 0, throwAt: 158, landAt: 168, dissolveAt: 178 },
      { r: 773, from: 0, throwAt: 200, landAt: 212 },
    ];
    const hatches = [
      { seg: 2, at: 142 },
      { seg: 3, at: 250 },
    ];
    const props = { stakes: STAKES, darts, hatches };
    const { container, rerender } = render(<SortitionRuler frame={50} {...props} />);
    expect(container.querySelectorAll("[data-dart]").length).toBe(0);

    // pinned: dart 0 sits at r=0 before its throw departs
    rerender(<SortitionRuler frame={80} {...props} />);
    expect(container.querySelectorAll("[data-dart]").length).toBe(1);
    expect((container.querySelector('[data-dart-body="0"]') as HTMLElement).style.left).toBe("0px");

    // all three thrown: collision dart dissolves, the re-derived dart lands
    rerender(<SortitionRuler frame={190} {...props} />);
    expect(container.querySelectorAll('[data-dart-body="2"]').length).toBe(0); // not yet thrown
    expect((container.querySelector('[data-dart-body="1"]') as HTMLElement).style.opacity).toBe("0");

    rerender(<SortitionRuler frame={260} {...props} />);
    expect(container.querySelector('[data-needle="2"]')).not.toBeNull();
    const hatchesNow = Array.from(container.querySelectorAll("[data-hatch]")) as HTMLElement[];
    expect(hatchesNow.length).toBe(2);
    expect(hatchesNow.every((h) => h.style.opacity === "1")).toBe(true);
  });

  it("sweeps multiple winners, each on its own beat", () => {
    const { container, rerender } = render(
      <SortitionRuler
        frame={108}
        stakes={STAKES}
        wins={[{ seg: 2, at: 108 }, { seg: 3, at: 216 }]}
      />,
    );
    const sweeps = () => Array.from(container.querySelectorAll("[data-seg] [data-win-sweep]")) as HTMLElement[];
    expect(sweeps().length).toBe(2);
    expect((sweeps()[0] as HTMLElement).style.width).toBe("0%");

    rerender(
      <SortitionRuler
        frame={230}
        stakes={STAKES}
        wins={[{ seg: 2, at: 108 }, { seg: 3, at: 216 }]}
      />,
    );
    expect(sweeps().every((s) => s.style.width === "100%")).toBe(true);
  });
});
describe("AppealCostCurve", () => {
  it("draws the prize line L→R, then the curve, flashing the crossing", () => {
    const { container, rerender } = render(<AppealCostCurve frame={0} at={60} />);
    const line = () => container.querySelector("[data-prize-line]") as SVGLineElement;
    expect(Number.parseFloat(line().getAttribute("x2") ?? "0")).toBe(88);

    rerender(<AppealCostCurve frame={16} at={60} />);
    const x2 = Number.parseFloat(line().getAttribute("x2") ?? "0");
    expect(x2).toBeGreaterThan(88);
    expect(x2).toBeLessThan(540);
    expect(container.querySelector("[data-cross]")).toBeNull();

    rerender(<AppealCostCurve frame={59} at={60} />);
    expect(
      (container.querySelector("[data-curve]") as SVGPathElement).getAttribute("stroke-dashoffset"),
    ).toBe("1");

    rerender(<AppealCostCurve frame={200} at={60} />);
    expect(
      (container.querySelector("[data-curve]") as SVGPathElement).getAttribute("stroke-dashoffset"),
    ).toBe("0");
    expect(container.querySelector("[data-cross]")).not.toBeNull();
    expect(screen.getByText("value of capturing the ruling")).toBeInTheDocument();
  });
});

describe("RetroBeam", () => {
  const ROUNDS = [
    { id: "R1", yes: 2, no: 1 },
    { id: "R2", yes: 2, no: 5 },
    { id: "R3", yes: 6, no: 9 },
  ];

  it("renders one dot per vote, recolored only as the beam passes", () => {
    const { container, rerender } = render(
      <RetroBeam frame={60} rounds={ROUNDS} finalRuling="no" />,
    );
    const dots = () => Array.from(container.querySelectorAll("[data-dot]")) as HTMLElement[];
    expect(dots().length).toBe(25);
    expect(dots().every((d) => d.dataset.passed === "false")).toBe(true);
    expect(dots()[0]).toHaveClass("bg-amber");

    rerender(<RetroBeam frame={200} rounds={ROUNDS} finalRuling="no" />);
    expect(dots().every((d) => d.dataset.passed === "true")).toBe(true);
    expect(dots()[0]).toHaveClass("bg-slash"); // yes vote vs a NO final ruling
    expect(dots()[2]).toHaveClass("bg-confirm"); // the no vote agrees
  });

  it("stamps the final ruling into its slot", () => {
    render(<RetroBeam frame={60} rounds={ROUNDS} finalRuling="no" />);
    expect(screen.getByText("dispute.final_ruling")).toBeInTheDocument();
    expect(screen.getByText("NO")).toBeInTheDocument();
  });

  it("fades the beam in at beamFrom and out after beamTo", () => {
    const { container, rerender } = render(
      <RetroBeam frame={50} rounds={ROUNDS} finalRuling="no" />,
    );
    const beam = () => container.querySelector("[data-beam]") as HTMLElement;
    expect(beam().style.opacity).toBe("0");

    rerender(<RetroBeam frame={100} rounds={ROUNDS} finalRuling="no" />);
    expect(beam().style.opacity).toBe("1");

    rerender(<RetroBeam frame={140} rounds={ROUNDS} finalRuling="no" />);
    expect(beam().style.opacity).toBe("0");
  });
  it("moves slashed stake to the coherent jurors after the beam passes", () => {
    // forced beam: everything passes by f10 → R1's transfers run f11–24
    const props = { rounds: [{ id: "R1", yes: 2, no: 1 }], finalRuling: "no" as const, beamFrom: 0, beamTo: 10 };
    const { container, rerender } = render(<RetroBeam frame={5} {...props} />);
    expect(container.querySelectorAll("[data-particle]").length).toBe(0);

    rerender(<RetroBeam frame={16} {...props} />);
    expect(container.querySelectorAll("[data-particle]").length).toBe(2); // both slashed jurors paying

    rerender(<RetroBeam frame={40} {...props} />);
    expect(container.querySelectorAll("[data-particle]").length).toBe(0); // arrived
    const dots = Array.from(container.querySelectorAll("[data-dot]")) as HTMLElement[];
    expect(Number.parseFloat(dots[0]?.style.opacity ?? "1")).toBeCloseTo(0.45, 5); // slashed: dimmed
    expect(dots[0]?.style.transform).toContain("scale(0.55)"); // and shrunk
    expect(dots[2]?.style.transform).toContain("scale(1.22)"); // receiver grew
  });

  it("skips the redistribution when asked", () => {
    const { container } = render(
      <RetroBeam
        frame={40}
        rounds={[{ id: "R1", yes: 2, no: 1 }]}
        finalRuling="no"
        beamFrom={0}
        beamTo={10}
        redistribute={false}
      />,
    );
    const dots = Array.from(container.querySelectorAll("[data-dot]")) as HTMLElement[];
    expect(dots[0]?.style.opacity).toBe("1");
    expect(dots[0]?.style.transform).toContain("scale(1)");
  });
});

describe("DrawCommitReveal", () => {
  it("runs pool → sealed votes → ruling on the frame clock", () => {
    const { container, rerender } = render(<DrawCommitReveal frame={30} />);
    expect(container.querySelectorAll("[data-pool] [data-dot]").length).toBe(30);
    expect(container.querySelectorAll("[data-votes] > div").length).toBe(3);
    expect((container.querySelector("[data-ruling] > div") as HTMLElement).style.opacity).toBe("0");

    rerender(<DrawCommitReveal frame={200} />);
    expect(screen.getByText("RULING: YES")).toBeInTheDocument();
  });

  it("commits lock as hashes, reveals flip them to votes", () => {
    const { container, rerender } = render(<DrawCommitReveal frame={134} />);
    const spans = () =>
      Array.from(
        (container.querySelectorAll("[data-votes] > div")[0] as HTMLElement).querySelectorAll(":scope > span"),
      ) as HTMLElement[];
    expect(spans()[0]?.textContent).toContain("6f3a91");
    expect(spans()[0]?.style.opacity).toBe("1");
    expect(spans()[1]?.style.opacity).toBe("0");

    rerender(<DrawCommitReveal frame={160} />);
    expect(spans()[0]?.style.opacity).toBe("0");
    expect(spans()[1]?.style.opacity).toBe("1");
    expect(spans()[1]?.textContent).toBe("yes");
  });
});

describe("DisputeFlow", () => {
  it("stages source → court → ruling → consumers on the frame clock", () => {
    const { container, rerender } = render(<DisputeFlow frame={0} at={15} />);
    const node = (name: string) => container.querySelector(`[data-node="${name}"]`) as HTMLElement;
    expect(node("source").style.opacity).toBe("0");

    rerender(<DisputeFlow frame={40} at={15} />);
    expect(node("source").style.opacity).toBe("1");
    expect(node("court").style.opacity).toBe("1");
    expect(node("ruling").style.opacity).toBe("1");
    const chips = Array.from(container.querySelectorAll("[data-consumer]")) as HTMLElement[];
    expect(chips.length).toBe(4);
    expect(chips.every((c) => c.style.opacity === "0")).toBe(true);

    rerender(<DisputeFlow frame={110} at={15} />);
    expect(chips.every((c) => c.style.opacity === "1")).toBe(true);
  });

  it("pulses travel the wires and slide under the next block at the loop's end", () => {
    const { container, rerender } = render(<DisputeFlow frame={0} at={15} />);
    const left = () =>
      Array.from(container.querySelectorAll("[data-pulse]")).map(
        (p) => Number.parseFloat((p as HTMLElement).style.left),
      );
    expect(left()[0]).toBe(0);
    expect(left()[1]).toBeCloseTo((22 / 45) * 200, 0);

    rerender(<DisputeFlow frame={10} at={15} />);
    expect(left()[0]).toBeCloseTo((10 / 45) * 200, 0);

    // late in the loop the dot's tail crosses into the block zone
    rerender(<DisputeFlow frame={44} at={15} />);
    expect(left()[0]).toBeGreaterThanOrEqual(192);
  });
});
