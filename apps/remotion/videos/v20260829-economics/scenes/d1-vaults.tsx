import { useCurrentFrame, useVideoConfig } from "remotion";

import { ConceptChrome, EquationBox, AuditRing, FlowArrow, InstructionChip, TokenParticle } from "./pieces";
import { multiTick } from "./timeline";
import { SubaccordCard, VaultBox } from "@useaccord/ui";
import { Scene } from "../../../src/shell/scene";
import type { TokenTone } from "@useaccord/ui";

/**
 * D1 · Two mints, two vaults — token topology + the accounting
 * invariants that hold by construction. The Subaccord container holds
 * stake_vault and fee_vault; every instruction's arrow is color-coded
 * by mint and terminates strictly on its own vault; a flow demo runs
 * the five instructions in order (particles in, counters ticking);
 * then the two equations seal. Audit-grade reassurance: nothing is
 * hidden, the tempo stays even.
 */

/** Instruction chips — left column touches stake, right touches fee. */
const CHIPS: readonly { label: string; tone: TokenTone; x: number; y: number; at: number }[] = [
  { label: "stake", tone: "stake", x: 480, y: 300, at: 22 },
  { label: "withdraw", tone: "stake", x: 480, y: 380, at: 25 },
  { label: "create_dispute", tone: "fee", x: 1440, y: 250, at: 29 },
  { label: "appeal", tone: "fee", x: 1440, y: 320, at: 32 },
  { label: "withdraw_fees", tone: "fee", x: 1440, y: 390, at: 35 },
];

/** Wiring — chip edge → vault edge. No arrow bridges the two vaults. */
const ARROWS: readonly { from: { x: number; y: number }; to: { x: number; y: number }; tone: TokenTone; at: number }[] = [
  { from: { x: 540, y: 300 }, to: { x: 716, y: 288 }, tone: "stake", at: 34 },
  { from: { x: 545, y: 380 }, to: { x: 716, y: 306 }, tone: "stake", at: 37 },
  { from: { x: 1352, y: 250 }, to: { x: 1204, y: 280 }, tone: "fee", at: 40 },
  { from: { x: 1388, y: 320 }, to: { x: 1204, y: 296 }, tone: "fee", at: 43 },
  { from: { x: 1358, y: 390 }, to: { x: 1204, y: 312 }, tone: "fee", at: 46 },
];

/** Flow demo, in instruction order (the 1/3 rule: one stream at a time). */
const FLOW: readonly { from: { x: number; y: number }; to: { x: number; y: number }; at: number; tone: TokenTone }[] = [
  { from: { x: 540, y: 300 }, to: { x: 722, y: 292 }, at: 66, tone: "stake" },
  { from: { x: 540, y: 300 }, to: { x: 722, y: 292 }, at: 69, tone: "stake" },
  { from: { x: 724, y: 296 }, to: { x: 545, y: 378 }, at: 96, tone: "stake" },
  { from: { x: 1352, y: 250 }, to: { x: 1198, y: 282 }, at: 118, tone: "fee" },
  { from: { x: 1352, y: 250 }, to: { x: 1198, y: 282 }, at: 121, tone: "fee" },
  { from: { x: 1352, y: 250 }, to: { x: 1198, y: 282 }, at: 124, tone: "fee" },
  { from: { x: 1388, y: 320 }, to: { x: 1198, y: 296 }, at: 143, tone: "fee" },
  { from: { x: 1388, y: 320 }, to: { x: 1198, y: 296 }, at: 146, tone: "fee" },
  { from: { x: 1198, y: 306 }, to: { x: 1358, y: 390 }, at: 166, tone: "fee" },
  { from: { x: 1198, y: 306 }, to: { x: 1358, y: 390 }, at: 169, tone: "fee" },
];

/** The audit glance: ring hops vault → equation → vault → equation. */
const HOPS: readonly { x: number; y: number; w: number; h: number; at: number }[] = [
  { x: 836, y: 290, w: 250, h: 130, at: 248 },
  { x: 660, y: 790, w: 470, h: 80, at: 266 },
  { x: 1084, y: 290, w: 250, h: 150, at: 284 },
  { x: 1290, y: 790, w: 790, h: 80, at: 302 },
];

export function D1VaultsScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Ledger phases — the counters are the source of truth; particles
  // only illustrate them. Ticks land with their stream's arrival.
  const stake = multiTick(frame, 1000, [
    { at: 84, to: 1040 },
    { at: 112, to: 1020 },
  ]);
  const fee = multiTick(frame, 480, [
    { at: 138, to: 510 },
    { at: 160, to: 525 },
    { at: 184, to: 505 },
  ]);
  const feePaid = frame >= 138 ? 30 : 0;
  const bonds = frame >= 160 ? 15 : 0;
  const feesEarned = frame >= 184 ? 460 : 480;

  return (
    <Scene seed="econ-d1">
      <ConceptChrome
        frame={frame}
        fps={fps}
        active={0}
        headline="two mints, two vaults"
        sub="every instruction touches exactly one mint's vault — the books balance by construction"
      />

      {/* the closed system */}
      <div className="absolute" style={{ left: 660, top: 196, width: 600 }}>
        <SubaccordCard frame={frame} title="Subaccord A" at={2}>
          <div className="flex items-start justify-center gap-6 pt-3">
            <VaultBox
              frame={frame}
              label="stake_vault"
              token="stake"
              from={stake.from}
              balance={stake.to}
              tickAt={stake.at}
              at={10}
            />
            <VaultBox
              frame={frame}
              label="fee_vault"
              token="fee"
              from={fee.from}
              balance={fee.to}
              tickAt={fee.at}
              at={13}
              subCounters={[
                { label: "fee_paid", value: feePaid },
                { label: "fees_earned", value: feesEarned },
                { label: "bonds", value: bonds },
              ]}
            />
          </div>
        </SubaccordCard>
      </div>

      {/* wiring + flow */}
      {ARROWS.map((a, i) => (
        <FlowArrow key={i} frame={frame} from={a.from} to={a.to} tone={a.tone} at={a.at} />
      ))}
      {CHIPS.map((c) => (
        <InstructionChip
          key={c.label}
          frame={frame}
          fps={fps}
          label={c.label}
          tone={c.tone}
          at={c.at}
          style={{ left: c.x, top: c.y }}
        />
      ))}
      {FLOW.map((p, i) => (
        <TokenParticle key={i} frame={frame} from={p.from} to={p.to} at={p.at} tone={p.tone} dur={13} />
      ))}

      {/* the invariants seal */}
      <EquationBox
        frame={frame}
        fps={fps}
        at={196}
        countAt={208}
        sealAt={230}
        tone="stake"
        lhs={{ label: "stake_vault.balance", value: 1020 }}
        rhs={{ label: "Σ JurorStake.staked", value: 1020 }}
        style={{ position: "absolute", left: 660, top: 790, translate: "-50% -50%" }}
      />
      <EquationBox
        frame={frame}
        fps={fps}
        at={202}
        countAt={214}
        sealAt={236}
        tone="fee"
        lhs={{ label: "fee_vault.balance", value: 505 }}
        rhs={{ label: "Σ fee_paid", value: 30 }}
        extra={[
          { label: "Σ fees_earned", value: 460 },
          { label: "Σ bonds", value: 15 },
        ]}
        style={{ position: "absolute", left: 1290, top: 790, translate: "-50% -50%" }}
      />

      {/* the audit glance */}
      {HOPS.map((h) => (
        <AuditRing key={h.at} frame={frame} x={h.x} y={h.y} w={h.w} h={h.h} at={h.at} />
      ))}
    </Scene>
  );
}
