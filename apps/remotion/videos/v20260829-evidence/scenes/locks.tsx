import type { CSSProperties, FC } from "react";

/**
 * locks.tsx — Group E scene-local staging: cryptography as *material*.
 * Padlock, KeyGlyph, VerifyTick, IdentityChip, Envelope — the pieces the
 * kit deliberately lacks (single-group staging stays out of @useaccord/ui).
 *
 * All are pure functions of caller-computed 0→1 progress numbers — the
 * same frame contract the kit obeys. One stroke weight throughout
 * (border-2 / strokeWidth 2) so the seal beat reads machined, not
 * clip-arty. Tokens only; the lone raw value is the house-approved
 * `var(--accord-amber)` glow.
 */

/**
 * Padlock — solid body + cockable shackle. `closed` 0 = open (shackle
 * cocked −24° and lifted), 1 = sealed (dropped, glowing). The Premium
 * seal beat lives in how the caller eases `closed`.
 */
export const Padlock: FC<{
  closed: number;
  size?: number;
  className?: string;
  style?: CSSProperties;
}> = ({ closed, size = 36, className, style }) => {
  const shackleW = Math.round(size * 0.56);
  return (
    <div
      className={`relative ${className ?? ""}`}
      style={{ width: size, height: Math.round(size * 1.3), ...style }}
    >
      {/* shackle */}
      <div
        className="absolute rounded-t-full border-2 border-b-0 border-amber"
        style={{
          width: shackleW,
          height: Math.round(size * 0.6),
          left: Math.round((size - shackleW) / 2),
          top: 0,
          opacity: 0.35 + 0.65 * closed,
          transform: `translateY(${(1 - closed) * -6}px) rotate(${(1 - closed) * -24}deg)`,
          transformOrigin: "bottom center",
        }}
      />
      {/* body */}
      <div
        className="absolute rounded-md border-2 border-border-subtle bg-raised"
        style={{
          width: size,
          height: Math.round(size * 0.7),
          top: Math.round(size * 0.56),
          boxShadow: `0 0 ${Math.round(14 * closed)}px var(--accord-amber)`,
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber"
          style={{ opacity: closed }}
        />
      </div>
    </div>
  );
};

/**
 * KeyGlyph — machined from an identity: circular bow, shaft, two teeth.
 * `machined` 0→1 grows it out of the chip it derives from; `turn` 0→1
 * rotates it 35° in the keyhole (the unlock beat).
 */
export const KeyGlyph: FC<{
  machined: number;
  turn?: number;
  width?: number;
  className?: string;
  style?: CSSProperties;
}> = ({ machined, turn = 0, width = 46, className, style }) => (
  <svg
    viewBox="0 0 32 18"
    width={width}
    height={Math.round((width * 18) / 32)}
    className={className}
    style={{
      opacity: machined,
      transform: `scale(${0.6 + 0.4 * machined}) rotate(${turn * 35}deg)`,
      transformOrigin: "7px 9px",
      filter: machined >= 1 ? `drop-shadow(0 0 5px var(--accord-amber))` : undefined,
      ...style,
    }}
  >
    <circle cx="7" cy="9" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path
      d="M11.5 9 H29 M23 9 V14 M29 9 V15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

/** VerifyTick — the draw-on checkmark (stroke draw, confirm tone via className). */
export const VerifyTick: FC<{
  draw: number;
  size?: number;
  className?: string;
  style?: CSSProperties;
}> = ({ draw, size = 22, className, style }) => (
  <svg
    viewBox="0 0 20 20"
    width={size}
    height={size}
    className={className}
    style={style}
  >
    <path
      d="M4 11 L8.5 15.5 L16 5.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - draw}
    />
  </svg>
);

/** IdentityChip — a shortened pubkey label; keys are machined from these, never free-floating. */
export const IdentityChip: FC<{
  pub: string;
  className?: string;
  style?: CSSProperties;
}> = ({ pub, className, style }) => (
  <div
    className={`inline-flex items-center gap-2 rounded-full border border-border-subtle bg-raised px-2.5 py-1 font-mono text-xs text-text-secondary ${className ?? ""}`}
    style={style}
  >
    <span className="h-1.5 w-1.5 rounded-full bg-amber/70" />
    {pub}
  </div>
);

/**
 * Envelope — the ciphertext vehicle. Tint = 40%-class fill of the
 * identity color (family semantics: amber tint in transit). `sealed`
 * drives the mini padlock; `opened` lifts the flap and washes the
 * plaintext out. Callers own position/scale via `style`.
 */
export const Envelope: FC<{
  sealed: number;
  opened?: number;
  label?: string;
  labelOpacity?: number;
  className?: string;
  style?: CSSProperties;
}> = ({ sealed, opened = 0, label, labelOpacity = 1, className, style }) => (
  <div
    className={`relative ${className ?? ""}`}
    style={{ width: 128, height: 88, ...style }}
  >
    <div className="absolute inset-0 rounded-lg border-2 border-amber/60 bg-amber/25">
      <svg
        viewBox="0 0 128 88"
        className="absolute inset-0 h-full w-full text-amber/60"
        preserveAspectRatio="none"
      >
        <path
          d="M3 8 L64 50 L125 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ opacity: 1 - opened * 0.7, transform: `translateY(${opened * -8}px)` }}
        />
      </svg>
      {/* plaintext — visible only once unsealed */}
      <div
        className="absolute inset-2 rounded-md bg-nearwhite/15"
        style={{ opacity: opened }}
      />
    </div>
    {sealed > 0.02 ? (
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Padlock closed={sealed} size={22} />
      </div>
    ) : null}
    {label ? (
      <div
        className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] text-text-secondary"
        style={{ opacity: labelOpacity }}
      >
        {label}
      </div>
    ) : null}
  </div>
);
