import type { FC } from "react";
import { useCurrentFrame } from "remotion";
import { cn } from "./cn";

/**
 * StepRail — ordered step labels with an amber progress fill each, the
 * active step highlighted. Give it the beat table; it derives starts.
 */
export const StepRail: FC<{
  steps: Array<{ label: string; frames: number }>;
  className?: string;
}> = ({ steps, className }) => {
  const frame = useCurrentFrame();
  const starts = steps.reduce<number[]>(
    (acc, step, i) => [...acc, (acc[i - 1] ?? 0) + (steps[i - 1]?.frames ?? 0)],
    [],
  );
  return (
    <div className={cn("mx-auto flex items-center gap-10", className)}>
      {steps.map((step, i) => {
        const start = starts[i] ?? 0;
        const past = frame >= start + step.frames;
        const active = !past && frame >= start;
        const fill = past ? 1 : active ? (frame - start) / step.frames : 0;
        return (
          <div key={step.label} className="flex flex-col items-center gap-2">
            <span
              className={`font-mono text-lg ${
                active || past ? "text-amber" : "text-text-secondary"
              }`}
            >
              {step.label}
            </span>
            <div className="h-[3px] w-28 overflow-hidden rounded-full bg-raised">
              <div
                className="h-full bg-amber"
                style={{ width: `${fill * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * PhaseCaptions — the compact caption row: ordered words, current and
 * past ones amber, upcoming muted.
 */
export const PhaseCaptions: FC<{
  labels: string[];
  active: number;
  className?: string;
}> = ({ labels, active, className }) => (
  <div
    className={cn("flex gap-10 font-mono text-sm tracking-widest", className)}
  >
    {labels.map((label, i) => (
      <span
        key={label}
        className={i === active ? "text-amber" : "text-muted-foreground"}
      >
        {label}
      </span>
    ))}
  </div>
);
