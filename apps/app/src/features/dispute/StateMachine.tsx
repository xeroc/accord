import { DisputeState } from "@useaccord/sdk";

const ORDERED_STATES: { key: DisputeState; label: string }[] = [
  { key: DisputeState.Created, label: "Created" },
  { key: DisputeState.Drawn, label: "Drawn" },
  { key: DisputeState.Review, label: "Review" },
  { key: DisputeState.Commit, label: "Commit" },
  { key: DisputeState.Reveal, label: "Reveal" },
  { key: DisputeState.RoundResolved, label: "Resolved" },
  { key: DisputeState.Final, label: "Final" },
  { key: DisputeState.Closed, label: "Closed" },
];

export function StateMachine({ current }: { current: DisputeState }) {
  const activeIdx = ORDERED_STATES.findIndex((s) => s.key === current);
  const isFailed = current === DisputeState.Failed;
  const isRedraw = current === DisputeState.RedrawEligible;

  if (isFailed) {
    return <span className="font-mono text-sm text-slash">● Failed</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {ORDERED_STATES.map((s, idx) => {
        const isActive = idx === activeIdx;
        const isPast = idx < activeIdx;
        const isRedrawMarker = isRedraw && idx === activeIdx;

        return (
          <span key={s.key} className="flex items-center">
            <span
              className={`font-mono text-sm ${
                isActive
                  ? isRedrawMarker
                    ? "text-amber"
                    : "text-confirm"
                  : isPast
                    ? "text-text-secondary line-through"
                    : "text-muted-foreground"
              }`}
            >
              {isActive ? "●" : isPast ? "✓" : "○"} {s.label}
            </span>
            {idx < ORDERED_STATES.length - 1 && (
              <span className="mx-1 text-muted-foreground">→</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
