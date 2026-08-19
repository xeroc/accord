import { useEffect, useState, type FC, type ReactNode } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";

/**
 * Block rendering until the Fontsource fonts pulled in by
 * @useaccord/ui/styles.css are loaded. Remotion does not wait for CSS
 * @font-face on its own; without this gate early frames lay out with
 * fallback fonts and every text measurement is wrong.
 */
export function useFontsReady(): void {
  const [handle] = useState(() => delayRender("Stage: document.fonts.ready"));
  useEffect(() => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        continueRender(handle);
      }
    };
    const fonts = document.fonts;
    const ready = fonts ? fonts.ready : Promise.resolve();
    Promise.resolve(ready).then(finish).catch(finish);
    return finish; // unmount safety net
  }, [handle]);
}

/**
 * <Stage> — the shared canvas every video renders inside: full-frame,
 * dark ink background from the ui-kit tokens, fonts gated before the
 * first frame is captured.
 */
export const Stage: FC<{ children: ReactNode; className?: string }> = ({
  children,
  className,
}) => {
  useFontsReady();
  return (
    <AbsoluteFill
      className={["bg-background text-foreground", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </AbsoluteFill>
  );
};
