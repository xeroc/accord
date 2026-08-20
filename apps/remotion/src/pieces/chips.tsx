import type { CSSProperties, FC, ReactNode } from "react";

import { cn } from "../shell/cn";

/**
 * Tone chips — the mono pill vocabulary for fees, deltas, labels.
 * Tone supplies the colors; size/padding/radius via className
 * (chip default px-2.5 py-1 text-xs; pills override with px-6 py-2.5
 * text-sm, question cards with px-6 py-3 text-2xl rounded-lg …).
 */

export type ChipTone = "amber" | "confirm" | "slash" | "neutral";

const TONE_CLASSES: Record<ChipTone, string> = {
  amber: "border-amber/50 bg-amber/10 text-amber",
  confirm: "border-confirm/50 bg-confirm/10 text-confirm",
  slash: "border-slash/50 bg-slash/10 text-slash",
  neutral: "border-border-subtle bg-raised text-text-secondary",
};

export const MonoChip: FC<{
  tone: ChipTone;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}> = ({ tone, className, style, children }) => (
  <div
    style={style}
    className={cn(
      "rounded-full border px-2.5 py-1 font-mono text-xs",
      TONE_CLASSES[tone],
      className,
    )}
  >
    {children}
  </div>
);

/**
 * DeltaChip — a +/− amount chip (fee earned, stake redistributed, stake
 * slashed). `pop` (0→1, typically a spring) pops it in; label names the
 * unit ("fee", "stake").
 */
export const DeltaChip: FC<{
  tone: "confirm" | "slash" | "amber";
  sign: "+" | "−";
  amount: number;
  label: string;
  pop: number;
  className?: string;
}> = ({ tone, sign, amount, label, pop, className }) => (
  <MonoChip tone={tone} className={className}>
    <span
      style={{ opacity: pop, transform: `scale(${0.6 + pop * 0.4})` }}
      className="inline-block"
    >
      {sign}
      {amount} {label}
    </span>
  </MonoChip>
);
