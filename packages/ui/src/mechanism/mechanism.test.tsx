import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JurorPool } from "./juror-pool";
import { MonoChip, DeltaChip } from "./chips";
import { RulingStamp } from "./ruling-stamp";
import { SealedVote } from "./sealed-vote";
import { TallyBar } from "./tally";

describe("JurorPool", () => {
  it("renders one dot per juror, idle dots hairline grey", () => {
    const { container } = render(
      <JurorPool count={30} cols={15} frame={0} drawnAt={() => undefined} />,
    );
    const dots = container.querySelectorAll("[data-dot]");
    expect(dots.length).toBe(30);
    expect(container.querySelector(".bg-amber")).toBeNull();
  });

  it("a drawn dot lights amber from its frame on", () => {
    const { container } = render(
      <JurorPool
        count={3}
        cols={3}
        frame={10}
        drawnAt={(d) => (d === 1 ? 5 : undefined)}
      />,
    );
    expect(container.querySelectorAll(".bg-amber").length).toBe(1);
  });

  it("renders the mono label when given", () => {
    render(
      <JurorPool count={3} cols={3} frame={0} drawnAt={() => undefined} label="STAKED POOL · 3" />,
    );
    expect(screen.getByText("STAKED POOL · 3")).toBeInTheDocument();
  });
});

describe("SealedVote", () => {
  it("shows the locked hash between commit and reveal", () => {
    render(
      <SealedVote hash="6f3a91" vote="YES" commitAt={0} revealAt={100} frame={20} />,
    );
    expect(screen.getByText(/6f3a91/)).toBeInTheDocument();
    // the vote span exists but is fully transparent before reveal
    expect(screen.getAllByText("YES")[0]?.style.opacity).toBe("0");
  });

  it("reveals the vote after revealAt", () => {
    render(
      <SealedVote hash="6f3a91" vote="YES" commitAt={0} revealAt={100} frame={115} />,
    );
    expect(screen.getAllByText("YES").length).toBeGreaterThan(0);
  });

  it("crosses out the incoherent vote at crossAt", () => {
    const { container } = render(
      <SealedVote
        hash="6f3a91"
        vote="NO"
        commitAt={0}
        revealAt={100}
        crossAt={200}
        tone="slash"
        frame={215}
      />,
    );
    const strokes = container.querySelectorAll(".bg-slash");
    expect(strokes.length).toBeGreaterThanOrEqual(2);
  });

  it("hash stays in flow so auto-height (chip) layouts size to their text", () => {
    const { container } = render(
      <SealedVote
        hash="6f3a91"
        vote="YES"
        commitAt={0}
        revealAt={100}
        frame={20}
        className="h-auto rounded-md bg-raised px-5 py-2.5 font-mono text-lg"
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    // container centers in-flow content…
    expect(root).toHaveClass("flex", "items-center", "justify-center");
    // …and the hash span participates in flow (only the vote overlays are absolute)
    const hash = screen.getByText(/6f3a91/).closest("span");
    expect(hash?.className).not.toContain("absolute");
  });
});

describe("RulingStamp", () => {
  it("is invisible before its frame", () => {
    render(<RulingStamp text="RULING: YES" at={100} frame={50} />);
    const el = screen.getByText("RULING: YES");
    expect(el.style.opacity).toBe("0");
  });

  it("lands fully after at+dur with the amber border lockup", () => {
    render(<RulingStamp text="RULING: YES" at={100} dur={8} frame={120} />);
    const el = screen.getByText("RULING: YES");
    expect(el.style.opacity).toBe("1");
    expect(el).toHaveClass("border-2", "border-amber", "text-amber");
    expect(el.style.boxShadow).toContain("--accord-amber");
  });

  it("glow can be switched off", () => {
    render(<RulingStamp text="R" at={0} frame={100} glow={false} />);
    expect(screen.getByText("R").style.boxShadow).toBe("");
  });
});

describe("TallyBar", () => {
  it("grows the amber majority bar proportional to the vote split", () => {
    const { container } = render(<TallyBar yes={4} no={1} at={0} frame={100} width={900} />);
    const bars = container.querySelectorAll("[data-bar]");
    const yes = bars[0] as HTMLElement;
    const no = bars[1] as HTMLElement;
    expect(yes.style.width).toBe("720px");
    expect(no.style.width).toBe("180px");
    expect(screen.getByText("YES · 4")).toBeInTheDocument();
    expect(screen.getByText("NO · 1")).toBeInTheDocument();
  });
});

describe("chips", () => {
  it("MonoChip maps tones to the palette classes", () => {
    const { container } = render(
      <>
        <MonoChip tone="amber">a</MonoChip>
        <MonoChip tone="confirm">b</MonoChip>
        <MonoChip tone="slash">c</MonoChip>
        <MonoChip tone="neutral">d</MonoChip>
      </>,
    );
    const chips = container.querySelectorAll("div");
    expect(chips[0]).toHaveClass("border-amber/50", "bg-amber/10", "text-amber");
    expect(chips[1]).toHaveClass("border-confirm/50", "bg-confirm/10", "text-confirm");
    expect(chips[2]).toHaveClass("border-slash/50", "bg-slash/10", "text-slash");
    expect(chips[3]).toHaveClass("border-border-subtle", "bg-raised", "text-text-secondary");
  });

  it("DeltaChip renders sign, amount and label", () => {
    render(<DeltaChip tone="amber" sign="+" amount={25} label="fee" pop={1} />);
    expect(screen.getByText("+25 fee")).toBeInTheDocument();
  });
});
