import { useCallback, useEffect, useRef, useState } from "react";

import { Backdrop, useWallClockFrame } from "@useaccord/ui";

import { SLIDES } from "./deck/slides";

/**
 * App — the deck shell. One Backdrop runs behind the entire deck (never
 * unmounts, so the ambient canvas is continuous across slides); each
 * slide mounts fresh with its own frame clock so the kit mechanisms
 * replay on every visit. Keyboard: ← → / space / Home / End, N toggles
 * the presenter notes.
 */
export function App() {
  const [index, setIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [leaving, setLeaving] = useState<number | null>(null);
  const backdropFrame = useWallClockFrame({ fps: 30 });
  const timers = useRef<number[]>([]);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.min(SLIDES.length - 1, Math.max(0, next));
      setIndex((current) => {
        if (clamped === current) {
          return current;
        }
        setLeaving(current);
        timers.current.forEach((t) => window.clearTimeout(t));
        timers.current = [window.setTimeout(() => setLeaving(null), 420)];
        return clamped;
      });
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "Home") {
        go(0);
      } else if (e.key === "End") {
        go(SLIDES.length - 1);
      } else if (e.key.toLowerCase() === "n") {
        setShowNotes((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const slide = SLIDES[index];
  if (!slide) {
    return null;
  }
  const Active = slide.component;
  const outgoing = leaving !== null ? SLIDES[leaving] : null;
  const Outgoing = outgoing?.component;

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink">
      {/* the deck-wide ambient canvas */}
      <Backdrop frame={backdropFrame} seed="pitch" />

      {/* slides — the leaving one fades out under the entering one */}
      {Outgoing ? (
        <div key={`out-${leaving}`} className="slide-exit absolute inset-0">
          <Outgoing />
        </div>
      ) : null}
      <div key={slide.id} className="slide absolute inset-0" data-slide={slide.id}>
        <Active />
      </div>

      {/* nav bar */}
      <nav className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-6 px-8 py-5 font-mono text-sm text-muted-foreground">
        <span className="tracking-[0.25em]">HANSE · DEMO DAY</span>
        <div className="flex items-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              aria-label={s.label}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-8 bg-amber" : "w-3 bg-border-subtle hover:bg-nearwhite/30"
                }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-4">
          <span className="tabular-nums">
            {String(index + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
          </span>
          <span className="select-none text-border-subtle">N for notes</span>
        </div>
      </nav>

      {/* presenter notes (N) */}
      {showNotes ? (
        <aside className="absolute inset-x-0 bottom-16 z-30 mx-auto max-w-3xl rounded-lg border border-amber/40 bg-ink/95 px-6 py-4 font-mono text-base leading-relaxed text-body shadow-[0_0_40px_var(--accord-amber)]">
          <div className="mb-1 text-xs tracking-[0.25em] text-amber">
            NOTES · {slide.label.toUpperCase()}
          </div>
          {slide.notes}
        </aside>
      ) : null}
    </div>
  );
}
