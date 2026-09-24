import type { FC, ReactNode } from "react";

/**
 * SlideFrame — the shared slide layout: kicker, headline, content.
 * Children stagger in via [data-rise]; the whole slide settles in on
 * the brand curve. One idea per slide, big type, no walls of text.
 */
export const SlideFrame: FC<{
  kicker?: string;
  headline: ReactNode;
  children?: ReactNode;
  align?: "left" | "center";
}> = ({ kicker, headline, children, align = "left" }) => (
  <div
    className={`flex h-full w-full flex-col justify-center gap-8 px-[7cqw]${
      align === "center" ? " items-center text-center" : ""
    }`}
  >
    <div
      data-rise
      className="flex flex-col gap-6"
      style={align === "center" ? { alignItems: "center" } : undefined}
    >
      {kicker ? (
        <div className="font-mono text-xl tracking-[0.3em] text-amber">{kicker}</div>
      ) : null}
      <h2 className="max-w-[22ch] font-heading text-6xl font-bold leading-[1.05] tracking-tight text-nearwhite">
        {headline}
      </h2>
    </div>
    {children ? (
      <div data-rise className="flex flex-col gap-8">
        {children}
      </div>
    ) : null}
  </div>
);
