/**
 * canon-logo.tsx — the Canon registry-rows glyph as an inline React component.
 *
 * Two unchecked rows (muted) + one amber-verified row — the curated-list
 * concept. Inline SVG so it inherits no external asset; scalable via
 * `className` (width/height or Tailwind size classes).
 */

export function CanonLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      role="img"
      aria-label="Canon Registry"
      className={className}
    >
      <rect width="32" height="32" rx="7" fill="#0A0E14" />
      {/* Row 1: unchecked */}
      <rect
        x="7"
        y="7"
        width="5"
        height="5"
        rx="1"
        stroke="#7D8590"
        strokeWidth="1.5"
        fill="none"
      />
      <line
        x1="14.5"
        y1="9.5"
        x2="25"
        y2="9.5"
        stroke="#7D8590"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Row 2: unchecked */}
      <rect
        x="7"
        y="13.5"
        width="5"
        height="5"
        rx="1"
        stroke="#7D8590"
        strokeWidth="1.5"
        fill="none"
      />
      <line
        x1="14.5"
        y1="16"
        x2="25"
        y2="16"
        stroke="#7D8590"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Row 3: amber-verified */}
      <rect x="7" y="20" width="5" height="5" rx="1" fill="#F0A830" />
      <path
        d="M8.8 22.5 L10.2 24 L13 21"
        stroke="#0A0E14"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line
        x1="14.5"
        y1="22.5"
        x2="25"
        y2="22.5"
        stroke="#F0A830"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
