import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, linear, tween } from "../internal/motion-math";

type MstNode = {
  a: number;
  b: number;
  level: number;
  x: number;
  y: number;
  parent: number | undefined;
  children: number[];
  leaf: number | undefined;
};

/**
 * MerkleSumTree — the accumulator: leaves are stake-weighted bars
 * (width ∝ stake), internal nodes plain dots, root on top. An update
 * to one leaf ripples up its ancestor path in discrete hops (leaf →
 * … → root, one hopDur per hop — hashing is discrete, each hop lands
 * before the next begins); off-path nodes frost out so the path is
 * the only living thing; zeroed leaves render hollow with a "0".
 * `resetAt` crossfades the scene back to neutral for the loop seam.
 * Pure function of `frame`.
 */
export const MerkleSumTree: FC<{
  frame: number;
  /** leaf stake weights — bar widths ∝ values */
  leaves: readonly number[];
  /** frame the tree starts drawing, root first (default 0) */
  at?: number;
  /** index of the leaf whose update ripples up to the root */
  updateLeaf?: number;
  /** frame the ripple starts (hop 0 = the updated leaf) */
  updateAt?: number;
  /** post-update stake for the updated leaf (odometers during hop 0) */
  updateTo?: number;
  /** frames per hop leaf→root (default 15 ≈ 500 ms cadence) */
  hopDur?: number;
  /** frame off-path nodes frost out (default: with updateAt) */
  frostAt?: number;
  /** frame the scene crossfades back to neutral (loop seam) */
  resetAt?: number;
  /** leaf indices rendered hollow/zeroed */
  zeroed?: readonly number[];
  /** frame the zeroed leaves drain to hollow (default: already hollow) */
  zeroAt?: number;
  /** per-leaf labels under the bars (suppresses the stake numbers) */
  leafLabels?: readonly string[];
  /** root annotation (hash / sum), shown once drawn */
  rootLabel?: string;
  width?: number;
  height?: number;
  className?: string;
}> = ({
  frame,
  leaves,
  at = 0,
  updateLeaf,
  updateAt,
  updateTo,
  hopDur = 15,
  frostAt,
  resetAt,
  zeroed,
  zeroAt,
  leafLabels,
  rootLabel,
  width = 440,
  height = 260,
  className,
}) => {
  const n = leaves.length;
  const depth = n > 1 ? Math.ceil(Math.log2(n)) : 1;

  // ---- layout (pure geometry from the weights) ----
  const pad = 28;
  const leafBandY = height - 34;
  const rowsTop = 22;
  const rowsBottom = height - 74;

  const total = leaves.reduce((s, w) => s + w, 0) || 1;
  const avail = width - pad * 2;
  const minW = Math.max(18, avail * 0.04);
  const widths = leaves.map((w) => Math.max(minW, (w / total) * avail));
  const centers: number[] = [];
  let cursor = pad;
  for (const w of widths) {
    centers.push(cursor + w / 2);
    cursor += w;
  }

  const nodes: MstNode[] = [];
  for (let i = 0; i < n; i++) {
    nodes.push({
      a: i,
      b: i,
      level: depth,
      x: centers[i] ?? pad,
      y: leafBandY,
      parent: undefined,
      children: [],
      leaf: i,
    });
  }

  const build = (a: number, b: number): number => {
    if (a === b) return a;
    const m = a + Math.floor((b - a) / 2);
    const leftIdx = build(a, m);
    const rightIdx = build(m + 1, b);
    const first = nodes[a];
    const last = nodes[b];
    const left = nodes[leftIdx];
    const right = nodes[rightIdx];
    if (!first || !last || !left || !right) return leftIdx; // unreachable by construction
    const level = Math.ceil(Math.log2(b - a + 1));
    const idx = nodes.length;
    nodes.push({
      a,
      b,
      level,
      x: (first.x + last.x) / 2,
      y: rowsTop + (level / depth) * (rowsBottom - rowsTop),
      parent: undefined,
      children: [leftIdx, rightIdx],
      leaf: undefined,
    });
    left.parent = idx;
    right.parent = idx;
    return idx;
  };
  if (n > 0) build(0, n - 1);

  // ---- update path (leaf → … → root) + hop timing ----
  const path: number[] = [];
  if (updateLeaf !== undefined && updateAt !== undefined) {
    let cur: number | undefined = updateLeaf;
    while (cur !== undefined) {
      path.push(cur);
      cur = nodes[cur]?.parent;
    }
  }
  const updateOn = updateLeaf !== undefined && updateAt !== undefined;
  const resetFade = resetAt !== undefined ? tween(frame, [resetAt, resetAt + 10], [1, 0], easeExpo) : 1;

  /** glow of the path node at hop k: rises fast, holds its hop, decays after. */
  const pathGlow = (k: number): number => {
    if (!updateOn || k < 0) return 0;
    const s = (updateAt as number) + k * hopDur;
    const e = s + hopDur;
    const rise = tween(frame, [s, s + 3], [0, 1], easeExpo);
    const fall = tween(frame, [e + 1, e + 6], [1, 0], linear);
    return Math.min(rise, fall) * resetFade;
  };

  const frostSince = frostAt ?? updateAt;
  const frostBase = frostSince !== undefined ? tween(frame, [frostSince, frostSince + 12], [0, 1], easeExpo) : 0;
  const onPath = new Set(path);

  // ---- entrance timing: root first, one level per 6 frames ----
  const nodeIn = (node: MstNode): number => {
    const base = at + node.level * 6;
    const leafStagger = node.leaf !== undefined ? Math.min(node.leaf, 8) : 0;
    return tween(frame, [base + leafStagger, base + leafStagger + 8], [0, 1], easeExpo);
  };

  const edgeIn = (parent: MstNode): number =>
    tween(frame, [at + parent.level * 6 + 4, at + parent.level * 6 + 10], [0, 1], easeExpo);

  const zeroSet = new Set(zeroed ?? []);
  const zeroDrain = zeroAt !== undefined ? tween(frame, [zeroAt, zeroAt + 10], [0, 1], easeExpo) : zeroSet.size > 0 ? 1 : 0;

  return (
    <div className={cn("relative", className)} style={{ width, height }}>
      {/* edges parent → child */}
      {nodes.map((node, i) =>
        node.leaf === undefined
          ? node.children.map((c) => {
              const child = nodes[c];
              if (!child) return null;
              const dx = child.x - node.x;
              const dy = child.y - node.y;
              const len = Math.hypot(dx, dy);
              const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
              // path edge: lights with the child's hop as the pulse departs.
              const glow = pathGlow(path.indexOf(c)) * resetFade;
              return (
                <div key={`e${i}-${c}`}>
                  <div
                    data-edge
                    className="absolute bg-border-subtle"
                    style={{
                      left: node.x,
                      top: node.y,
                      width: len,
                      height: 1.5,
                      transformOrigin: "0 0",
                      transform: `rotate(${angle}deg) scaleX(${edgeIn(node)})`,
                    }}
                  />
                  {glow > 0 ? (
                    <div
                      data-edge-lit
                      className="absolute bg-amber"
                      style={{
                        left: node.x,
                        top: node.y,
                        width: len,
                        height: 1.5,
                        transformOrigin: "0 0",
                        transform: `rotate(${angle}deg) scaleX(${edgeIn(node)})`,
                        opacity: glow,
                      }}
                    />
                  ) : null}
                </div>
              );
            })
          : null,
      )}

      {/* internal nodes + root */}
      {nodes.map((node, i) =>
        node.leaf === undefined ? (
          (() => {
            const glow = pathGlow(path.indexOf(i));
            return (
              <div
                key={`n${i}`}
                data-node={i}
                className="absolute flex items-center justify-center rounded-full border bg-raised"
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.level === 0 ? 16 : 10,
                  height: node.level === 0 ? 16 : 10,
                  transform: `translate(-50%, -50%) scale(${0.6 + nodeIn(node) * 0.4})`,
                  opacity: nodeIn(node),
                  borderColor: glow > 0.05 ? "var(--accord-amber)" : "var(--accord-border)",
                  boxShadow: glow > 0.05 ? `0 0 ${10 * glow}px var(--accord-amber)` : undefined,
                }}
              >
                {node.level === 0 && rootLabel ? (
                  <span
                    data-root-label
                    className="absolute top-5 left-1/2 -translate-x-1/2 font-mono text-xs whitespace-nowrap text-muted-foreground"
                    style={{ opacity: tween(frame, [at + 14, at + 20], [0, 1], easeExpo) }}
                  >
                    {rootLabel}
                  </span>
                ) : null}
              </div>
            );
          })()
        ) : null,
      )}

      {/* leaves */}
      {nodes.map((node, i) => {
        if (node.leaf === undefined) return null;
        const li = node.leaf;
        const w = widths[li] ?? minW;
        const isZero = zeroSet.has(li);
        const hopGlow = updateLeaf === li ? pathGlow(0) : 0;
        const fillW = isZero ? w * (1 - zeroDrain) : w;
        const frost = frostBase * (onPath && !onPath.has(i) ? 0.65 : 0) * resetFade;
        const base = leaves[li] ?? 0;
        const stakeShown = Math.round(
          updateLeaf === li && updateTo !== undefined
            ? tween(frame, [(updateAt as number), (updateAt as number) + hopDur], [base, updateTo], easeExpo)
            : base,
        );
        const lit = hopGlow > 0.05;
        return (
          <div key={`l${i}`} data-leaf={li} className="absolute" style={{ left: node.x, top: node.y }}>
            <div
              className="relative -translate-x-1/2 -translate-y-1/2 rounded-sm"
              style={{
                width: w,
                height: 14,
                opacity: nodeIn(node) * (1 - frost),
                border: lit ? "1px solid var(--accord-amber)" : "1px solid var(--accord-border)",
                boxShadow: lit ? `0 0 ${10 * hopGlow}px var(--accord-amber)` : undefined,
              }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-sm bg-nearwhite/30"
                style={{ width: Math.max(0, fillW - 2) }}
              />
              {isZero ? (
                <span
                  className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-muted-foreground"
                  style={{ opacity: zeroDrain }}
                >
                  0
                </span>
              ) : null}
            </div>
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 font-mono text-[10px] whitespace-nowrap text-muted-foreground"
              style={{ opacity: nodeIn(node) }}
            >
              {leafLabels?.[li] ?? (n <= 8 ? <span data-leaf-value={li} className="tabular-nums text-text-secondary">{stakeShown}</span> : null)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
