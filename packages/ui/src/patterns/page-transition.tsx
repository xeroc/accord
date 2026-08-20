/**
 * PageTransition — the shared route-change motion wrapper.
 *
 * Fades + slides + unblurs page content on mount and reverses on exit
 * (`AnimatePresence mode="wait"`). The app keeps `useLocation()` and its
 * `<Routes location={location}>`; this module never imports the router —
 * it only keys the animation on whatever `transitionKey` the app passes
 * (conventionally `location.pathname`).
 */
import { AnimatePresence, motion } from "motion/react";
import type { Key, ReactNode } from "react";

export function PageTransition({
  transitionKey,
  children,
  className,
}: {
  /** Change it (e.g. pathname) to animate out the old page and in the new. */
  transitionKey: Key;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={transitionKey}
        initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{
          opacity: 0,
          y: -12,
          filter: "blur(4px)",
          transition: { type: "spring", bounce: 0, duration: 0.3 },
        }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
