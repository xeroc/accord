import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { DisputeState } from "@useaccord/sdk";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@useaccord/ui";

import { DisputeList } from "../../../../app/src/features/dispute/DisputeList";
import { AppHarness } from "../../../src/appstage/app-harness";
import { makeDispute } from "../../../src/appstage/fixtures";
import { SPRING } from "../../../src/shell/presets";

const SEEDED_DISPUTES = [
  makeDispute({
    address: "Acc0rd1111111111111111111111111111111111111",
    filer: "F1ler11111111111111111111111111111111111111",
    state: DisputeState.Commit,
  }),
  makeDispute({
    address: "Acc0rd2222222222222222222222222222222222222",
    filer: "F1ler22222222222222222222222222222222222222",
    state: DisputeState.Reveal,
  }),
  makeDispute({
    address: "Acc0rd3333333333333333333333333333333333333",
    filer: "F1ler33333333333333333333333333333333333333",
    state: DisputeState.Final,
    currentRound: 1,
    finalRuling: 1n,
  }),
];

/**
 * AppStage in action: the REAL apps/app DisputeList, mounted through
 * AppHarness over seeded fixtures — zero network, deterministic frames.
 */
export function DisputesScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { ...SPRING.gentle, damping: 22 } });

  return (
    <div className="flex h-full items-center justify-center p-16">
      <Card
        className="w-[1440px]"
        style={{ transform: `scale(${0.92 + 0.08 * enter})`, opacity: enter }}
      >
        <CardHeader>
          <CardTitle className="font-heading text-2xl">
            Disputes — live app view
          </CardTitle>
          <CardDescription>
            apps/app/src/features/dispute/DisputeList via AppHarness
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AppHarness route="/disputes" seed={{ disputes: SEEDED_DISPUTES }}>
            <DisputeList />
          </AppHarness>
        </CardContent>
      </Card>
    </div>
  );
}
