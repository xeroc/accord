import { Badge, DisputeStatusCard } from "@useaccord/ui";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";

export function StatusScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div className="flex h-full items-center justify-center gap-24 p-16">
      <DisputeStatusCard
        title="Dispute Acc0rd…3333"
        rows={[
          { label: "State", value: <Badge variant="secondary">Final</Badge> },
          { label: "Ruling", value: "Option 1" },
          { label: "Panel", value: "5 jurors" },
          { label: "Filing fee", value: "5.000000 USDC" },
          { label: "Appeals used", value: "1 / 2" },
        ]}
        note={
          <p className="mt-3 font-mono text-xs text-text-secondary">
            Ruling emitted on-chain — the Arbitrable reads it lazily.
          </p>
        }
      />
      <div
        className="flex max-w-xl flex-col gap-4"
        style={{ opacity: enterAt(frame, fps, 0.4) }}
      >
        <h2 className="font-heading text-5xl font-bold text-nearwhite">
          One primitive.
        </h2>
        <h2
          className="font-heading text-5xl font-bold text-amber"
          style={{ opacity: enterAt(frame, fps, 0.8) }}
        >
          Every agreement.
        </h2>
      </div>
    </div>
  );
}
