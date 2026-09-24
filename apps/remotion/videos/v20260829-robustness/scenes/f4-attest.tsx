import { useCurrentFrame } from "remotion";

import {
  JurorPool,
  LedgerCounter,
  MerkleSumTree,
  MonoChip,
  VaultBox,
} from "@useaccord/ui";
import { ArcToken, ConceptScene, breath, lin, pop, rise, stepped, tw } from "./chrome";

/**
 * F4 — the attestation gate + prune_juror.
 *
 * Three timestamps guard the pool: at `stake` the SAS attestation's
 * expiry must outlive the worst-case dispute horizon; at `draw_seat`
 * freshness is re-stamped; past expiry, anyone may turn the
 * `prune_juror` crank — the leaf zeroes and the funds leave as a
 * pending withdrawal, mirroring request_withdraw. Not a slash.
 */

const LANE_Y = 430;
const GATE_X = 250;
const SEAT_X = 1080;
const CRANK_X = 1180;

/** tree leaves — index 2 is the tracked juror */
const LEAVES_A = [140, 90, 0, 160, 110, 130, 100];
const LEAVES_B = [140, 90, 140, 160, 110, 130, 100];

const CHIP_PATH = [
  { at: 33, x: 70, y: LANE_Y },
  { at: 48, x: 228, y: LANE_Y },
  { at: 84, x: 252, y: LANE_Y },
  { at: 99, x: 560, y: LANE_Y },
  { at: 129, x: 560, y: LANE_Y },
  { at: 144, x: 938, y: LANE_Y },
  { at: 162, x: 938, y: LANE_Y },
  { at: 177, x: SEAT_X, y: LANE_Y },
  { at: 207, x: SEAT_X, y: LANE_Y },
  { at: 225, x: 1240, y: LANE_Y },
];

function Turnstile({ frame }: { frame: number }) {
  const angle = tw(frame, 72, 84, 0, 120);
  return (
    <svg width={64} height={72} viewBox="0 0 64 72" className="text-text-secondary" fill="none">
      <line x1={10} y1={8} x2={10} y2={64} stroke="currentColor" strokeWidth={2.5} />
      <line x1={54} y1={8} x2={54} y2={64} stroke="currentColor" strokeWidth={2.5} />
      <g transform={`rotate(${angle} 32 36)`} className="text-amber">
        <circle cx={32} cy={36} r={5} fill="currentColor" />
        <line x1={32} y1={36} x2={32} y2={12} stroke="currentColor" strokeWidth={3} strokeLinecap="square" />
        <line x1={32} y1={36} x2={53} y2={48} stroke="currentColor" strokeWidth={3} strokeLinecap="square" />
        <line x1={32} y1={36} x2={11} y2={48} stroke="currentColor" strokeWidth={3} strokeLinecap="square" />
      </g>
    </svg>
  );
}

function StampGlyph({ frame }: { frame: number }) {
  const descend = tw(frame, 144, 156, 0, 1);
  const squash = 0.03 * Math.sin(Math.PI * lin(frame, 155, 161, 0, 1));
  const y = 300 + descend * 62;
  const op = tw(frame, 141, 147, 0, 1) * tw(frame, 166, 174, 1, 0.35);
  return (
    <div className="absolute" style={{ left: 950, top: y, translate: "-50% -50%", opacity: op }}>
      <svg width={40} height={52} viewBox="0 0 40 52" className="text-amber" fill="none"
        style={{ transform: `scaleY(${1 - squash})` }}>
        <line x1={20} y1={0} x2={20} y2={14} stroke="currentColor" strokeWidth={3} />
        <rect x={8} y={14} width={24} height={14} rx={3} fill="currentColor" opacity={0.85} />
        <rect x={4} y={30} width={32} height={10} rx={2} stroke="currentColor" strokeWidth={2.5} />
      </svg>
    </div>
  );
}

function Crank({ frame }: { frame: number }) {
  const angle = tw(frame, 195, 207, 0, 90);
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" className="text-text-secondary" fill="none">
      <circle cx={32} cy={32} r={20} stroke="currentColor" strokeWidth={2.5} />
      <g transform={`rotate(${angle} 32 32)`} className={frame >= 195 ? "text-amber" : "text-text-secondary"}>
        <line x1={32} y1={32} x2={32} y2={8} stroke="currentColor" strokeWidth={3.5} strokeLinecap="square" />
        <circle cx={32} cy={8} r={4} fill="currentColor" />
      </g>
      <circle cx={32} cy={32} r={4} fill="currentColor" />
    </svg>
  );
}

/** permissionless "any hands" — three distinct pushers, not one authority */
function AnyHands({ frame }: { frame: number }) {
  return (
    <div className="absolute" style={{ left: CRANK_X, top: 356, translate: "-50% -50%", opacity: tw(frame, 191, 197, 0, 1) }}>
      <div className="flex items-center gap-3">
        {[0, 1, 2].map((h) => {
          const push = 3 * Math.sin(Math.PI * lin(frame, 195 + h * 4, 202 + h * 4, 0, 1));
          return (
            <svg key={h} width={22} height={22} viewBox="0 0 22 22" className="text-nearwhite/70" fill="none"
              style={{ transform: `translateX(${push}px)` }}>
              <rect x={4} y={8} width={13} height={10} rx={3} stroke="currentColor" strokeWidth={2} />
              <rect x={12} y={2} width={5} height={9} rx={2.5} stroke="currentColor" strokeWidth={2} />
            </svg>
          );
        })}
      </div>
      <div className="mt-1 text-center font-mono text-[10px] text-muted-foreground">any hand · permissionless</div>
    </div>
  );
}

/** SAS attestation card riding with the juror chip */
function AttestationCard({ frame, x, y }: { frame: number; x: number; y: number }) {
  const scanX = 75 + lin(frame, 48, 57, 0, 150);
  const expired = frame >= 189;
  const visible = frame >= 33 && frame <= 232;
  if (!visible) {
    return null;
  }
  return (
    <div
      className={`absolute w-[150px] rounded-lg border px-2.5 py-2 ${
        expired ? "border-amber/60 bg-amber/10" : "border-border-subtle bg-raised/70"
      }`}
      style={{ left: x - 75, top: y - 96, opacity: tw(frame, 33, 40, 0, 1) }}
    >
      <div className="relative overflow-hidden">
        <div className="font-mono text-[10px] leading-4 text-text-secondary">juror_credential</div>
        <div className="font-mono text-[10px] leading-4 text-text-secondary">juror_schema · sas</div>
        <div className={`font-mono text-[10px] leading-4 ${expired ? "text-amber" : "text-muted-foreground"}`}>
          expiry {expired ? "· past" : "· ahead"}
        </div>
        {frame >= 48 && frame <= 60 ? (
          <div
            className="absolute top-0 h-full w-[2px] bg-amber"
            style={{ left: scanX, opacity: 0.9, boxShadow: "0 0 8px var(--accord-amber)" }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function F4AttestScene() {
  const frame = useCurrentFrame();
  const chip = stepped(frame, CHIP_PATH);
  const nowX = 160 + tw(frame, 171, 189, 0, 420);
  const treeSwap = tw(frame, 207, 216, 0, 1);
  const shuffle = 2 * Math.sin((frame * 2 * Math.PI) / 120);

  return (
    <ConceptScene
      seed="robustness-f4"
      kicker="ATTESTATION GATE + PRUNE_JUROR"
      title="three timestamps guard the pool"
      caption="expiry outlives the horizon · re-checked at the draw · eviction is a withdrawal, not a slash"
    >
      <div className="relative" style={{ width: 1420, height: 690 }}>
        {/* horizon ruler above the gate */}
        <div className="absolute" style={{ left: 140, top: 178, opacity: tw(frame, 12, 24, 0, 1) }}>
          <svg width={470} height={44} viewBox="0 0 470 44" fill="none">
            <line x1={0} y1={22} x2={430} y2={22} className="text-border-subtle" stroke="currentColor" strokeWidth={1.5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - tw(frame, 45, 60, 0, 1)} />
            <line x1={400} y1={10} x2={400} y2={34} className="text-confirm" stroke="currentColor" strokeWidth={2} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - tw(frame, 54, 62, 0, 1)} />
            <line x1={440} y1={12} x2={440} y2={32} className="text-amber" stroke="currentColor" strokeWidth={2} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - tw(frame, 63, 70, 0, 1)} />
          </svg>
          <div className="absolute font-mono text-[10px] text-muted-foreground" style={{ left: -12, top: 26 }}>worst-case dispute horizon</div>
          {/* the advancing "now" marker */}
          <div className="absolute" style={{ left: nowX - 140, top: 14 }}>
            <svg width={12} height={16} viewBox="0 0 12 16" fill="none">
              <polygon points="6,0 12,8 0,8" className="text-nearwhite" fill="currentColor" />
              <line x1={6} y1={8} x2={6} y2={16} className="text-nearwhite/70" stroke="currentColor" strokeWidth={1.5} />
            </svg>
            <div className="absolute left-3 top-1 font-mono text-[10px] text-nearwhite whitespace-nowrap">now</div>
          </div>
          <div className="absolute font-mono text-[10px] text-amber" style={{ left: 425, top: -12 }}>expiry</div>
        </div>
        {/* gate check */}
        <div className="absolute" style={{ left: 470, top: 168, ...pop(frame, 66, 8) }}>
          <MonoChip tone="confirm">expiry &gt; horizon ✓</MonoChip>
        </div>

        {/* lane stations */}
        <div className="absolute flex flex-col items-center gap-1" style={{ left: GATE_X, top: LANE_Y - 36, translate: "-50% 0", ...rise(frame, 3, 9) }}>
          <Turnstile frame={frame} />
          <div className="font-mono text-xs text-text-secondary">stake · entry gate</div>
        </div>
        <div className="absolute flex flex-col items-center gap-1" style={{ left: 950, top: LANE_Y - 30, translate: "-50% 0", ...rise(frame, 7, 9) }}>
          <div className="font-mono text-xs text-text-secondary">draw_seat · freshness</div>
        </div>
        <div className="absolute flex flex-col items-center gap-1" style={{ left: CRANK_X, top: LANE_Y - 36, translate: "-50% 0", ...rise(frame, 11, 9) }}>
          <Crank frame={frame} />
          <div className="font-mono text-xs text-text-secondary">prune_juror</div>
        </div>
        <AnyHands frame={frame} />

        {/* the lane itself */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1420 690" fill="none">
          <line x1={90} y1={LANE_Y} x2={1330} y2={LANE_Y} className="text-border-subtle" stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 8" />
          <rect x={SEAT_X - 5} y={LANE_Y - 16} width={10} height={32} rx={2} className="text-amber/60" stroke="currentColor" strokeWidth={1.5} opacity={tw(frame, 171, 181, 0, 1)} />
        </svg>
        <div className="absolute font-mono text-[10px] text-amber" style={{ left: SEAT_X + 12, top: LANE_Y - 20, opacity: tw(frame, 171, 181, 0, 1) }}>
          drawn seat
        </div>

        {/* juror pool */}
        <div className="absolute" style={{ left: 350, top: LANE_Y - 34 }}>
          <JurorPool
            frame={frame}
            count={14}
            cols={14}
            dotSize={9}
            label="juror pool"
            drawnAt={(d) => (d === 6 ? 117 : undefined)}
          />
        </div>

        {/* VRF sparkle passing over the pool */}
        {frame >= 114 && frame <= 132 ? (
          <div
            className="absolute"
            style={{
              left: 380 + lin(frame, 114, 129, 0, 440),
              top: LANE_Y - 22,
              translate: "-50% -50%",
              opacity: tw(frame, 114, 118, 0, 1) * tw(frame, 126, 131, 1, 0),
              rotate: `${lin(frame, 114, 129, 0, 90)}deg`,
            }}
          >
            <svg width={22} height={22} viewBox="0 0 22 22" className="text-amber" fill="none">
              <polygon points="11,0 13,9 22,11 13,13 11,22 9,13 0,11 9,9" fill="currentColor" />
            </svg>
          </div>
        ) : null}
        <div className="absolute" style={{ left: 560, top: LANE_Y - 92, ...pop(frame, 118, 8) }}>
          <MonoChip tone="amber">vrf · selected</MonoChip>
        </div>

        <StampGlyph frame={frame} />
        {/* dated stamp left behind */}
        <div className="absolute" style={{ left: 1000, top: LANE_Y + 16, ...pop(frame, 158, 8) }}>
          <MonoChip tone="confirm">fresh @ draw_seat ✓</MonoChip>
        </div>

        {/* the tracked juror chip + its attestation card */}
        <AttestationCard frame={frame} x={chip.x} y={chip.y} />
        <div
          className="absolute h-4 w-4 rounded-full bg-nearwhite"
          style={{
            left: chip.x, top: chip.y, translate: "-50% -50%",
            opacity: tw(frame, 33, 40, 0, 1) * tw(frame, 225, 232, 1, 0),
            boxShadow: "0 0 10px var(--accord-nearwhite)",
          }}
        />
        {/* escorted-out annotation */}
        <div className="absolute" style={{ left: 1235, top: LANE_Y + 22, ...pop(frame, 216, 8) }}>
          <MonoChip tone="neutral">escorted out</MonoChip>
        </div>

        {/* the accumulator inset — fill, then the prune zeroing */}
        <div className="absolute" style={{ left: 880, top: 36, opacity: 1 - treeSwap }}>
          <MerkleSumTree
            frame={frame}
            leaves={LEAVES_A}
            at={6}
            updateLeaf={2}
            updateAt={93}
            updateTo={140}
            frostAt={93}
            hopDur={12}
            width={480}
            height={280}
            rootLabel="root · Σ stake"
          />
        </div>
        <div className="absolute" style={{ left: 880, top: 36, opacity: treeSwap }}>
          <MerkleSumTree
            frame={frame}
            leaves={LEAVES_B}
            at={0}
            updateLeaf={2}
            updateAt={213}
            updateTo={0}
            zeroed={[2]}
            zeroAt={213}
            frostAt={213}
            hopDur={12}
            width={480}
            height={280}
            rootLabel="root · Σ stake"
          />
        </div>
        {/* root-sum ledger — ticks with the hops */}
        <div className="absolute" style={{ left: 1030, top: 330, opacity: 1 - treeSwap }}>
          <LedgerCounter frame={frame} label="root Σ stake" from={730} to={870} at={96} dur={12} tone="confirm" />
        </div>
        <div className="absolute" style={{ left: 1030, top: 330, opacity: treeSwap }}>
          <LedgerCounter frame={frame} label="root Σ stake" from={870} to={730} at={249} dur={12} tone="amber" />
        </div>

        {/* funds arc: zeroed leaf → pending_withdrawal */}
        <ArcToken
          frame={frame}
          tone="stake"
          from={{ x: 1010, y: 316 }}
          to={{ x: 1130, y: 545 }}
          lift={-56}
          at={225}
          dur={15}
        />

        {/* the withdrawal tray */}
        <div className="absolute" style={{ left: 1010, top: 540 }}>
          <VaultBox
            frame={frame}
            label="pending_withdrawal"
            token="stake"
            from={0}
            balance={140}
            at={228}
            tickAt={232}
          />
        </div>
        <div className="absolute" style={{ left: 1240, top: 560, ...pop(frame, 240, 8) }}>
          <MonoChip tone="confirm">mirrors request_withdraw</MonoChip>
        </div>

        {/* summary — the three defense layers */}
        <div className="absolute flex gap-4" style={{ left: 90, top: 618 }}>
          <div style={pop(frame, 282, 9)}><MonoChip tone="confirm">1 · expiry &gt; horizon</MonoChip></div>
          <div style={pop(frame, 294, 9)}><MonoChip tone="amber">2 · re-check at draw_seat</MonoChip></div>
          <div style={pop(frame, 306, 9)}><MonoChip tone="neutral">3 · prune · permissionless</MonoChip></div>
        </div>

        {/* a fresh chip queues at the gate (loop hook) */}
        <div
          className="absolute h-3 w-3 rounded-full bg-nearwhite/80"
          style={{
            left: 120 + shuffle, top: LANE_Y, translate: "-50% -50%",
            opacity: tw(frame, 300, 312, 0, 0.9) * (0.75 + 0.25 * breath(frame, 120, 1.2)),
          }}
        />
      </div>
    </ConceptScene>
  );
}
