/**
 * synod-logo.tsx — "The Assembly" glyph as an inline React component.
 *
 * N muted party nodes seated in an arc, each converging on ONE central amber
 * verdict diamond — the Synod concept (BRAND.md voice: the mechanism, not the
 * committee). Inline SVG so it inherits no external asset; scalable via
 * `className` (width/height or Tailwind size classes).
 */

const NODES: readonly [number, number][] = [
  [10.2, 9.1],
  [7.8, 12.2],
  [7, 16],
  [7.8, 19.8],
  [10.2, 22.9],
];

const DIAMOND: readonly [number, number] = [21, 16];

export function SynodLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      role="img"
      aria-label="Synod"
      className={className}
    >
      <rect width="32" height="32" rx="7" fill="#0A0E14" />
      {/* party nodes converge on the verdict */}
      {NODES.map(([x, y]) => (
        <line
          key={`l-${x}-${y}`}
          x1={x}
          y1={y}
          x2={DIAMOND[0]}
          y2={DIAMOND[1]}
          stroke="#7D8590"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.7"
        />
      ))}
      {NODES.map(([x, y]) => (
        <circle key={`n-${x}-${y}`} cx={x} cy={y} r="1.8" fill="#7D8590" />
      ))}
      {/* the one verdict */}
      <path
        d="M21 11.5 L25.5 16 L21 20.5 L16.5 16 Z"
        fill="#F0A830"
        stroke="#0A0E14"
        strokeWidth="1"
      />
    </svg>
  );
}
