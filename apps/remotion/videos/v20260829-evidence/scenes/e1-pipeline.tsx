import { Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { clamp, enterAt, exitAt, scramble } from "../../../src/shell/anim";
import { EASE_EXPO } from "../../../src/shell/presets";
import { PhaseCaptions } from "../../../src/shell/rail";
import { Scene } from "../../../src/shell/scene";
import { ChainStrip, MonoChip } from "@useaccord/ui";
import { Envelope, IdentityChip, KeyGlyph, Padlock, VerifyTick } from "./locks";

/**
 * E1 — the evidence pipeline, played once (linear cut of the 8s loop
 * proposal). The filer folds a manifest into one sha256 root, seals it,
 * the chain keeps 32 bytes, ciphertext relays through the operator (the
 * one honest trust blob, pinned in amber), and copies re-key to each
 * entry of Round.jurors[] — the undrawn slot derives nothing.
 *
 * Spatial language: filer left → operator center → drawn jurors right;
 * the chain strip owns the bottom band and is never occluded.
 */

const LAYOUT = {
  filer: { x: 110, y: 288, w: 390, h: 330 },
  operator: { x: 790, y: 312, w: 370, h: 270 },
  juror: { x: 1450, w: 350, h: 116 },
  undrawnY: 668,
  chainY: 918,
} as const;

const JUROR_Y = [236, 384, 532] as const;
const PUBS = ["9a1K…mQp", "F2cX…7tz", "Qm8b…a41"] as const;
const LEAVES = ["contract.md", "invoice.pdf", "chat.log"] as const;
const HASH = "9f3ae1c2";

/** Beat table (frames, 30 fps). */
const B = {
  leafAt: (i: number) => 4 + i * 3,
  foldAt: (i: number) => 28 + i * 3,
  rootAt: 40,
  sealAt: 48, // seal dur 8 — the Premium beat
  idChipAt: 50,
  keyAt: 56,
  hashAt: 54, // chain cell appends + types
  departAt: 90, // transit leg 1 (26 f)
  arriveAt: 116,
  unlockAt: 122,
  tagAt: 128,
  panelAt: 134, // panel expand dur 14
  rekeyAt: (i: number) => 152 + i * 3,
  noKeyAt: 158,
  splitAt: 164,
  fanAt: (i: number) => 180 + i * 2, // fan dur 24
  hashPulseAt: 196,
  unsealAt: (i: number) => 210 + i * 4,
  hexAt: (i: number) => 218 + i * 4,
  tickAt: (i: number) => 226 + i * 4,
  shimmerAt: 258,
  fadeAt: 298, // narrative artifacts out, dur 22
} as const;

const PHASES = [
  { label: "manifest", start: 0 },
  { label: "seal", start: 48 },
  { label: "relay", start: 90 },
  { label: "re-key", start: 128 },
  { label: "deliver", start: 180 },
  { label: "verify", start: 210 },
] as const;

interface Pt {
  x: number;
  y: number;
}

const qp = (p0: Pt, c: Pt, p1: Pt, t: number): Pt => ({
  x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * c.x + t ** 2 * p1.x,
  y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * c.y + t ** 2 * p1.y,
});
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (p0: Pt, c: Pt, p1: Pt) => `M ${p0.x} ${p0.y} Q ${c.x} ${c.y} ${p1.x} ${p1.y}`;

/** Transit legs — shallow arcs (≤6% sag), each well under the 1/3 rule. */
const LEG1 = {
  p0: { x: 348, y: 565 },
  c: { x: 545, y: 565 },
  p1: { x: 725, y: 470 },
};
const FAN0 = { x: 735, y: 470 } as const;
const fanTarget = (i: number): Pt => ({ x: 1508, y: (JUROR_Y[i] ?? 532) + 56 });
const fanCtrl = (i: number): Pt => {
  const ty = fanTarget(i).y;
  return { x: 1120, y: (470 + ty) / 2 - 36 * (1 - i) };
};
const keyTarget = (i: number): Pt => ({ x: 1466, y: (JUROR_Y[i] ?? 532) + 36 });
const keyCtrl = (i: number): Pt => {
  const ty = keyTarget(i).y;
  return { x: 1140, y: (470 + ty) / 2 - 30 * (1 - i) };
};

export function E1PipelineScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // master narrative fade — structure and the lit hash cell survive it
  const fadeK = exitAt(frame, fps, B.fadeAt / fps, 22 / fps);
  const ease = { easing: EASE_EXPO, ...clamp };

  const activePhase = PHASES.reduce((acc, p, i) => (frame >= p.start ? i : acc), 0);

  // ---- filer: leaves fold into the root --------------------------------
  const leafTop = (i: number) => 380 + i * 56;
  const foldT = (i: number) => interpolate(frame, [B.foldAt(i), B.foldAt(i) + 5], [0, 1], ease);

  const rootIn = interpolate(frame, [B.rootAt, B.rootAt + 8], [0, 1], ease);
  const sealK = interpolate(frame, [B.sealAt, B.sealAt + 8], [0, 1], ease);

  // ---- operator identity → key ------------------------------------------
  const chipIn = interpolate(frame, [B.idChipAt, B.idChipAt + 4], [0, 1], ease);
  const chipSlide = interpolate(frame, [B.idChipAt, B.idChipAt + 6], [0, 84], ease);
  const opKeyIn = interpolate(frame, [B.keyAt, B.keyAt + 6], [0, 1], ease);
  const opKeyTurn = interpolate(frame, [B.unlockAt, B.unlockAt + 6], [0, 1], ease);

  // ---- envelope: seal → relay → split ------------------------------------
  const envIn = interpolate(frame, [B.sealAt + 6, B.sealAt + 12], [0, 1], ease);
  const t1 = interpolate(frame, [B.departAt, B.arriveAt], [0, 1], ease);
  const envPos = qp(LEG1.p0, LEG1.c, LEG1.p1, t1);
  const squeeze = interpolate(frame, [86, 90, 114, 118], [0, 1, 1, 0], clamp);
  const envScale = 1 - 0.03 * squeeze - 0.012 * Math.sin(Math.PI * t1);
  const envSealed = interpolate(frame, [B.unlockAt, B.unlockAt + 6], [1, 0], ease);
  const envOpened = interpolate(frame, [B.unlockAt + 2, B.unlockAt + 8], [0, 1], ease);
  const envOut = interpolate(frame, [B.splitAt, B.splitAt + 8], [1, 0], ease);

  // ---- Round.jurors[] panel ----------------------------------------------
  const panelH = interpolate(frame, [B.panelAt, B.panelAt + 14], [0, 190], ease);
  const panelIn = interpolate(frame, [B.panelAt, B.panelAt + 6], [0, 1], ease);
  const noKeyK = interpolate(
    frame,
    [B.noKeyAt, B.noKeyAt + 3, B.noKeyAt + 11, B.noKeyAt + 14],
    [0, 1, 1, 0],
    clamp,
  );

  // ---- per-juror delivery beats -------------------------------------------
  const fanT = (i: number) => interpolate(frame, [B.fanAt(i), B.fanAt(i) + 24], [0, 1], ease);
  const copyIn = (i: number) => interpolate(frame, [B.splitAt + i, B.splitAt + 8 + i], [0, 1], ease);
  const restK = (i: number) =>
    interpolate(frame, [B.fanAt(i) + 24, B.fanAt(i) + 29], [0, 1], ease);
  const spawnOffsetK = interpolate(frame, [176, 180], [0, 1], ease);
  const openK = interpolate(frame, [B.unlockAt + 2, B.unlockAt + 10], [0, 1], ease);

  return (
    <Scene seed="e1-pipeline">
      <div className="absolute inset-0">
        {/* headline */}
        <div
          className="absolute left-0 w-full text-center font-mono text-sm uppercase tracking-[0.35em] text-text-secondary"
          style={{ top: 54, opacity: enterAt(frame, fps, 0.2, 0.4) }}
        >
          e1 · the evidence pipeline
        </div>

        {/* ================= filer ================= */}
        <Interactive.Div
          name="Filer card"
          className="absolute rounded-xl border border-border-subtle bg-raised"
          style={{
            left: LAYOUT.filer.x,
            top: LAYOUT.filer.y,
            width: LAYOUT.filer.w,
            height: LAYOUT.filer.h,
            opacity: enterAt(frame, fps, 0.15, 0.4),
          }}
        >
          <div className="flex items-center gap-2.5 px-6 pt-5">
            <div className="h-2.5 w-2.5 rounded-full border border-amber bg-amber/30" />
            <span className="font-mono text-sm text-text-secondary">Arbitrable · filer</span>
          </div>
          <div className="px-6 pt-1 font-mono text-[11px] text-muted-foreground">
            manifest.yaml
          </div>

          {/* file leaves — fold up into the root */}
          {LEAVES.map((name, i) => {
            const inK = interpolate(frame, [B.leafAt(i), B.leafAt(i) + 8], [0, 1], ease);
            const fold = foldT(i);
            const foldFade = interpolate(fold, [0.5, 1], [0, 1], clamp);
            return (
              <div
                key={name}
                className="absolute flex items-center gap-2 rounded-md border border-border-subtle bg-background px-3 font-mono text-sm text-text-secondary"
                style={{
                  left: 70,
                  width: 250,
                  height: 46,
                  top: lerp(leafTop(i) - LAYOUT.filer.y, 250, fold),
                  opacity: inK * (1 - foldFade),
                }}
              >
                <span className="h-3.5 w-3 rounded-[2px] border border-border-subtle" />
                {name}
              </div>
            );
          })}

          {/* sha256 root chip */}
          <div
            className="absolute flex items-center justify-center gap-2 rounded-lg border border-amber/50 bg-amber/10 px-3 font-mono text-sm text-amber"
            style={{
              left: 45,
              width: 300,
              height: 54,
              top: 250,
              opacity: rootIn,
              transform: `scale(${0.94 + rootIn * 0.06})`,
            }}
          >
            sha256 root · {scramble("e1-root", frame, `${HASH.slice(0, 6)}…`, frame >= B.rootAt + 6)}
          </div>
        </Interactive.Div>

        {/* the seal — a lock closes over the root */}
        <div
          className="absolute"
          style={{ left: LAYOUT.filer.x + 8, top: LAYOUT.filer.y + 246, opacity: fadeK }}
        >
          <Padlock closed={sealK} size={44} />
        </div>

        {/* ================= operator ================= */}
        <Interactive.Div
          name="Operator card"
          className="absolute rounded-xl border border-border-subtle bg-raised"
          style={{
            left: LAYOUT.operator.x,
            top: LAYOUT.operator.y,
            width: LAYOUT.operator.w,
            height: LAYOUT.operator.h,
            opacity: enterAt(frame, fps, 0.25, 0.4),
          }}
        >
          <div className="flex items-center gap-2.5 px-6 pt-5">
            <div className="h-2.5 w-2.5 rounded-full border border-amber bg-amber/30" />
            <span className="font-mono text-sm text-text-secondary">evidence operator</span>
          </div>
          <div className="px-6 pt-1 font-mono text-[11px] text-muted-foreground">
            service · relays bytes to the drawn
          </div>
          {/* plaintext — exposed only inside this card */}
          <div
            className="absolute inset-3 rounded-lg bg-nearwhite/10"
            style={{ opacity: openK * (0.55 + 0.08 * Math.sin(frame / 9)) * fadeK }}
          />
        </Interactive.Div>

        {/* the honest tag — pinned plainly, never hidden */}
        <div
          className="absolute"
          style={{
            left: LAYOUT.operator.x + 192,
            top: LAYOUT.operator.y - 16,
            opacity: interpolate(frame, [B.tagAt, B.tagAt + 8], [0, 1], ease) * fadeK,
            transform: `translateY(${(1 - interpolate(frame, [B.tagAt, B.tagAt + 8], [0, 1], ease)) * 8}px)`,
          }}
        >
          <MonoChip tone="amber" className="px-3 py-1.5 text-sm">
            operator sees plaintext
          </MonoChip>
        </div>

        {/* operator identity chip — the pubkey the filer sealed to */}
        <div
          className="absolute"
          style={{
            left: LAYOUT.operator.x + 16 - chipSlide,
            top: 396,
            opacity: chipIn * fadeK,
          }}
        >
          <IdentityChip pub={PUBS[0]} />
        </div>

        {/* the key machined from it, waiting at the operator */}
        <div
          className="absolute"
          style={{
            left: 664,
            top: 402,
            transform: "translate(-50%, -50%)",
            opacity: opKeyIn * fadeK,
          }}
        >
          <KeyGlyph machined={opKeyIn} turn={opKeyTurn} className="text-amber" />
        </div>

        {/* ================= Round.jurors[] panel ================= */}
        <div
          className="absolute overflow-hidden rounded-lg border border-border-subtle bg-raised/70"
          style={{
            left: LAYOUT.operator.x,
            top: LAYOUT.operator.y + LAYOUT.operator.h + 16,
            width: LAYOUT.operator.w,
            height: panelH,
            opacity: panelIn,
          }}
        >
          <div className="px-4 pt-2.5 font-mono text-xs text-muted-foreground">Round.jurors[]</div>
          {PUBS.map((pub, i) => (
            <div
              key={pub}
              className="absolute"
              style={{
                left: 16,
                top: 34 + i * 38,
                opacity:
                  interpolate(
                    frame,
                    [B.panelAt + 4 + i * 3, B.panelAt + 10 + i * 3],
                    [0, 1],
                    ease,
                  ) * fadeK,
              }}
            >
              <IdentityChip pub={pub} />
            </div>
          ))}
          {/* the undrawn row — nothing derives from it */}
          <div
            className="absolute inline-flex items-center gap-2 rounded-full border border-dashed border-border-subtle px-2.5 py-1 font-mono text-xs text-muted-foreground"
            style={{ left: 16, top: 34 + 3 * 38, opacity: panelIn }}
          >
            <span className="h-1.5 w-1.5 rounded-full border border-border-subtle" />
            — not drawn —
          </div>
          <div
            className="absolute rounded-full border border-dashed border-border-subtle px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
            style={{ left: 180, top: 40 + 3 * 38, opacity: noKeyK }}
          >
            ∅ no key
          </div>
        </div>

        {/* ================= drawn jurors ================= */}
        <div
          className="absolute font-mono text-xs text-muted-foreground"
          style={{ left: LAYOUT.juror.x, top: 204, opacity: enterAt(frame, fps, 0.4, 0.4) }}
        >
          round 0 · drawn
        </div>
        {PUBS.map((pub, i) => {
          const inK = interpolate(frame, [10 + i * 2, 20 + i * 2], [0, 1], ease);
          const hexIn = interpolate(frame, [B.hexAt(i), B.hexAt(i) + 5], [0, 1], ease);
          const slideK = interpolate(frame, [B.hexAt(i), B.hexAt(i) + 5], [0, 1], ease);
          const tickDraw = interpolate(frame, [B.tickAt(i), B.tickAt(i) + 5], [0, 1], clamp);
          const tickPulse = Math.sin(
            Math.PI * interpolate(frame, [B.tickAt(i) + 5, B.tickAt(i) + 10], [0, 1], clamp),
          );
          const verified = frame >= B.tickAt(i) + 4;
          return (
            <Interactive.Div
              key={pub}
              name={`Juror ${pub}`}
              className={`absolute rounded-xl border bg-raised ${verified ? "border-confirm/40" : "border-border-subtle"}`}
              style={{
                left: LAYOUT.juror.x,
                top: JUROR_Y[i],
                width: LAYOUT.juror.w,
                height: LAYOUT.juror.h,
                opacity: inK,
                transform: `translateY(${(1 - inK) * 20}px)`,
              }}
            >
              <div className="flex items-center gap-2 px-4 pt-2.5">
                <div className="h-2 w-2 rounded-full border border-amber bg-amber/30" />
                <span className="font-mono text-xs text-text-secondary">juror {pub}</span>
              </div>
              {/* recomputed vs on-chain — slide together, lock with the tick */}
              <div
                className="absolute left-4 top-[70px] flex items-center gap-2"
                style={{ opacity: hexIn * fadeK }}
              >
                <div style={{ transform: `translateX(${(1 - slideK) * -14}px)` }}>
                  <MonoChip tone="neutral">recomputed {HASH.slice(0, 4)}…</MonoChip>
                </div>
                <div style={{ transform: `translateX(${(1 - slideK) * 14}px)` }}>
                  <MonoChip tone="amber">on-chain {HASH.slice(0, 4)}…</MonoChip>
                </div>
                <VerifyTick
                  draw={tickDraw}
                  className="text-confirm"
                  style={{ transform: `scale(${1 + tickPulse * 0.02})` }}
                />
              </div>
            </Interactive.Div>
          );
        })}

        {/* the undrawn slot — dashed, keyless */}
        <div
          className="absolute rounded-xl border-2 border-dashed border-border-subtle"
          style={{
            left: LAYOUT.juror.x,
            top: LAYOUT.undrawnY,
            width: LAYOUT.juror.w,
            height: LAYOUT.juror.h,
            opacity: interpolate(frame, [14, 24], [0, 1], ease),
          }}
        >
          <div className="flex h-full items-center justify-center gap-3 font-mono text-xs text-muted-foreground">
            not drawn
            <span
              className="rounded-full border border-dashed border-border-subtle px-2 py-0.5 text-[11px]"
              style={{ opacity: noKeyK }}
            >
              ∅ no key
            </span>
          </div>
        </div>

        {/* ================= transit paths ================= */}
        <svg
          className="pointer-events-none absolute inset-0"
          width={1920}
          height={1080}
          viewBox="0 0 1920 1080"
        >
          {/* conduit base */}
          <path
            d="M 505 470 H 715"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="text-border-subtle"
            style={{ opacity: interpolate(frame, [20, 28], [0, 1], clamp) }}
          />
          {/* ambient dash-flow — always toward the operator */}
          <path
            d="M 505 470 H 715"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="text-amber/35"
            strokeDasharray="5 13"
            style={{
              strokeDashoffset: -frame * 1.1,
              opacity: interpolate(frame, [B.sealAt, B.sealAt + 8], [0, 0.5], clamp) * fadeK,
            }}
          />
          {/* transit leg 1 — draws with the envelope */}
          {frame >= B.departAt && frame <= B.arriveAt + 6 ? (
            <path
              d={seg(LEG1.p0, LEG1.c, LEG1.p1)}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="text-amber/40"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - t1}
            />
          ) : null}
          {/* fan-out arcs — one per drawn juror */}
          {PUBS.map((pub, i) => {
            if (frame < B.fanAt(i) - 2 || frame > B.fanAt(i) + 30) return null;
            return (
              <path
                key={pub}
                d={seg(FAN0, fanCtrl(i), fanTarget(i))}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="text-amber/30"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - fanT(i)}
                style={{
                  opacity: interpolate(frame, [B.fanAt(i) + 24, B.fanAt(i) + 30], [1, 0], clamp),
                }}
              />
            );
          })}
        </svg>

        {/* ================= vehicles ================= */}
        {/* the sealed envelope: filer → operator */}
        {frame < B.splitAt + 8 ? (
          <Envelope
            sealed={envSealed}
            opened={envOpened}
            className="absolute"
            style={{
              left: envPos.x,
              top: envPos.y,
              transform: `translate(-50%, -50%) scale(${envScale})`,
              opacity: envIn * envOut,
            }}
          />
        ) : null}

        {/* re-keyed copies — one per drawn juror, addressed on the envelope */}
        {PUBS.map((pub, i) => {
          const t = fanT(i);
          const pos = qp(FAN0, fanCtrl(i), fanTarget(i), t);
          const y = pos.y + (i - 1) * 16 * (1 - spawnOffsetK) * (1 - t);
          const opened = interpolate(frame, [B.unsealAt(i) + 2, B.unsealAt(i) + 8], [0, 1], ease);
          const copyOut = interpolate(frame, [B.unsealAt(i) + 8, B.unsealAt(i) + 16], [1, 0], ease);
          return (
            <Envelope
              key={pub}
              sealed={1}
              opened={opened}
              label={pub}
              labelOpacity={copyIn(i) * (1 - restK(i))}
              className="absolute"
              style={{
                left: pos.x,
                top: y,
                transform: `translate(-50%, -50%) scale(${1 - 0.38 * restK(i)})`,
                opacity: copyIn(i) * copyOut * fadeK,
              }}
            />
          );
        })}

        {/* the keys machined from Round.jurors[] — ride with their copies */}
        {PUBS.map((pub, i) => {
          const machineK = interpolate(frame, [B.rekeyAt(i), B.rekeyAt(i) + 6], [0, 1], ease);
          const hopT = interpolate(frame, [171 + i, 179 + i], [0, 1], ease);
          const from: Pt = { x: 1100, y: 634 + i * 38 };
          const pos =
            frame < 180
              ? { x: lerp(from.x, 760, hopT), y: lerp(from.y, 470 + (i - 1) * 16, hopT) }
              : qp({ x: 760, y: 470 }, keyCtrl(i), keyTarget(i), Math.min(1, fanT(i) + 0.05));
          const turn = interpolate(frame, [B.unsealAt(i), B.unsealAt(i) + 6], [0, 1], ease);
          return (
            <div
              key={`key-${pub}`}
              className="absolute"
              style={{
                left: pos.x,
                top: pos.y,
                transform: "translate(-50%, -50%)",
                opacity: machineK * fadeK,
              }}
            >
              <KeyGlyph machined={machineK} turn={turn} className="text-amber" />
            </div>
          );
        })}

        {/* ================= the chain ================= */}
        <Interactive.Div name="Chain strip" className="absolute left-0 w-full" style={{ top: LAYOUT.chainY }}>
          <div className="flex justify-center">
            <ChainStrip
              frame={frame}
              cells={["…", "r0 · 3 drawn", HASH, "…"]}
              appendAt={(i) => (i === 2 ? B.hashAt : 4 + i * 4)}
              highlight={2}
              highlightAt={B.hashAt + 4}
              typePerChar={3}
              pulseAt={B.hashPulseAt}
              shimmerAt={B.shimmerAt}
              cellWidth={104}
            />
          </div>
          <div
            className="mt-3 text-center font-mono text-xs text-text-secondary"
            style={{ opacity: enterAt(frame, fps, 2, 0.5) }}
          >
            on-chain · 32 bytes per round · sha256
          </div>
        </Interactive.Div>

        {/* the closing line — after the transports fade, the ink remains */}
        <div
          className="absolute left-0 w-full text-center font-mono text-sm text-amber/80"
          style={{ top: 866, opacity: enterAt(frame, fps, (B.fadeAt + 26) / fps, 0.5) }}
        >
          transports are ephemeral — the hash is permanent
        </div>

        {/* captions */}
        <div className="absolute left-0 w-full" style={{ top: 1016 }}>
          <PhaseCaptions labels={PHASES.map((p) => p.label)} active={activePhase} />
        </div>
      </div>
    </Scene>
  );
}
