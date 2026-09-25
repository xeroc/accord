import { useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { LedgerCounter, MonoChip, RetroBeam, TallyBar } from "@useaccord/ui";

import { ConceptChrome } from "./pieces";
import { multiTick } from "./timeline";

/**
 * D4 · Final-ruling retroactive coherence — a horizontal round
 * timeline. The kit RetroBeam owns the rail, the round dots (colored
 * by option until the beam recolors them against dispute.final_ruling
 * — R1's bribed majority is the spotlight), the final_ruling slot,
 * and the slashed→coherent stake redistribution. The scene layers the
 * D2-convention ledger annotations over it: active_draws counters and
 * the round-local tallies (the record of what each round once said).
 */
const RAIL_Y = 570;

const ROUNDS: readonly {
  id: string;
  center: number;
  yes: number;
  no: number;
  drawsAt: number;
  chipAt: number;
}[] = [
  { id: "R1", center: 460, yes: 2, no: 1, drawsAt: 134, chipAt: 137 },
  { id: "R2", center: 740, yes: 2, no: 5, drawsAt: 156, chipAt: 159 },
  { id: "R3", center: 1020, yes: 6, no: 9, drawsAt: 176, chipAt: 179 },
];

const SLOT_X = 1300;
/** RetroBeam box: canvas (260, 250) — round centers go local (−260). */
const BEAM_BOX = { left: 260, top: 250 };

export function D4RetroBeamScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="econ-d4">
      <ConceptChrome
        frame={frame}
        fps={fps}
        active={3}
        headline="the final ruling reaches back"
        sub="coherence is judged against dispute.final_ruling — no round escapes the settle"
      />

      {/* rail + dots + slot + beam + redistribution — one kit piece */}
      <div className="absolute" style={{ left: BEAM_BOX.left, top: BEAM_BOX.top }}>
        <RetroBeam
          frame={frame}
          rounds={ROUNDS.map(({ id, yes, no }) => ({ id, yes, no }))}
          finalRuling="no"
          centers={ROUNDS.map((r) => r.center - BEAM_BOX.left)}
          beamFrom={66}
          beamTo={126}
          rulingAt={46}
          slotAt={30}
          spotlight={{ round: 0, side: "yes" }}
        />
      </div>

      {/* round annotations over the kit piece */}
      {ROUNDS.map((r, ri) => {
        const count = r.yes + r.no;
        return (
          <div key={r.id}>
            {/* active_draws */}
            <div
              className="absolute"
              style={{ left: r.center, top: 352, translate: "-50% -50%", opacity: enterAt(frame, fps, (16 + ri * 12) / fps, 6 / fps) }}
            >
              <LedgerCounter
                frame={frame}
                label={`${r.id} active_draws`}
                {...multiTick(frame, count, [{ at: r.drawsAt, to: 0 }])}
                tone={frame >= r.drawsAt ? "confirm" : "neutral"}
              />
            </div>

            {/* round-local tally (the record of what each round once said) */}
            <div
              className="absolute"
              style={{ left: r.center, top: RAIL_Y + 30, translate: "-50% 0", opacity: enterAt(frame, fps, (ri * 12 + 6) / fps, 6 / fps) }}
            >
              <TallyBar frame={frame} yes={r.yes} no={r.no} at={14 + ri * 12} width={220} />
            </div>

          </div>
        );
      })}

      {/* finality seal */}
      <div
        className="absolute"
        style={{ left: SLOT_X, top: 640, translate: "-50% 0", opacity: enterAt(frame, fps, 202 / fps, 8 / fps) }}
      >
        <MonoChip tone="confirm">✓ final_ruling · stakes redistributed</MonoChip>
      </div>
    </Scene>
  );
}
