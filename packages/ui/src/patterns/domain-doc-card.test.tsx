import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DOMAIN_DOC_TEMPLATE, DomainDocCard } from "./domain-doc-card";

const OK_DOC = {
  status: "ok" as const,
  title: "List Rules",
  description: "What belongs here",
  body: "## Rules\n\nBe honest.",
  raw: "---\ntitle: List Rules\ndescription: What belongs here\n---\n\n## Rules\n\nBe honest.\n",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DomainDocCard — read states", () => {
  it("loading: renders a loading placeholder, no doc content", () => {
    render(<DomainDocCard doc={{ status: "loading" }} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /rules/i })).toBeNull();
  });

  it("missing: loud 404 state renders the retry action slot", () => {
    render(
      <DomainDocCard
        doc={{ status: "missing" }}
        retry={<button type="button">Publish now</button>}
      />,
    );
    expect(screen.getByText(/not published|missing/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Publish now" }),
    ).toBeInTheDocument();
  });

  it("tampered: verification-failed warning is shown", () => {
    render(<DomainDocCard doc={{ status: "tampered" }} />);
    expect(
      screen.getByText(/verification failed|tampered/i),
    ).toBeInTheDocument();
  });

  it("ok: renders frontmatter title/description header + markdown body", () => {
    render(<DomainDocCard doc={OK_DOC} hash={"a".repeat(64)} />);
    expect(
      screen.getByRole("heading", { name: "List Rules" }),
    ).toBeInTheDocument();
    expect(screen.getByText("What belongs here")).toBeInTheDocument();
    // markdown body rendered (h2 from "## Rules")
    expect(
      screen.getByRole("heading", { level: 2, name: "Rules" }),
    ).toBeInTheDocument();
  });
});

describe("DomainDocCard — download", () => {
  it("download button creates a blob objectURL and clicks it", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:domain-doc");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");

    render(<DomainDocCard doc={OK_DOC} hash={"a".repeat(64)} />);
    await userEvent.click(screen.getByRole("button", { name: /download/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe("text/markdown");
    expect(blob.size).toBe(OK_DOC.raw.length);
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:domain-doc");
  });
});

describe("DomainDocCard — editable mode", () => {
  it("renders ONE textarea over the raw doc with the frontmatter emphasized as a distinct block", () => {
    const raw = "---\ntitle: Draft\ndescription: wip\n---\n\n## Rules\n\nTBD.";
    render(<DomainDocCard editable value={raw} onValueChange={() => {}} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe(raw);
    expect(textarea).toBeEnabled();
    // frontmatter block: mono/distinct-bg preview of the leading --- block
    const fm = screen.getByTestId("domain-doc-frontmatter");
    expect(fm.textContent).toContain("title: Draft");
    expect(fm.textContent).toContain("---");
  });

  it("locks (disabled textarea) when editable flips to false on submit", () => {
    const { rerender } = render(
      <DomainDocCard
        editable
        value="---\ntitle: x\n---\nbody"
        onValueChange={() => {}}
      />,
    );
    expect(screen.getByRole("textbox")).toBeEnabled();
    rerender(
      <DomainDocCard
        editable={false}
        value="---\ntitle: x\n---\nbody"
        onValueChange={() => {}}
      />,
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("typing propagates through onValueChange", async () => {
    const onValueChange = vi.fn();
    render(
      <DomainDocCard
        editable
        value={"---\ntitle: Draft\n---\n\nbody"}
        onValueChange={onValueChange}
      />,
    );
    await userEvent.type(screen.getByRole("textbox"), "!");
    expect(onValueChange).toHaveBeenCalledWith(
      "---\ntitle: Draft\n---\n\nbody!",
    );
  });

  it("no frontmatter in the raw text omits the emphasis block", () => {
    render(
      <DomainDocCard editable value="just body" onValueChange={() => {}} />,
    );
    expect(screen.queryByTestId("domain-doc-frontmatter")).toBeNull();
    expect(screen.getByRole("textbox")).toHaveValue("just body");
  });
});

describe("DOMAIN_DOC_TEMPLATE", () => {
  it("prefills frontmatter title/description + a ## Rules stub", () => {
    expect(DOMAIN_DOC_TEMPLATE).toMatch(/^---\ntitle:/);
    expect(DOMAIN_DOC_TEMPLATE).toContain("description:");
    expect(DOMAIN_DOC_TEMPLATE).toContain("## Rules");
  });
});
