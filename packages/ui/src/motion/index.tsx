/**
 * Motion primitives for list/page animations.
 *
 * Uses `motion/react` (motion v11+). Brand easing: cubic-bezier(0.22, 1, 0.36, 1)
 * (DESIGN.md §08 --ease-expo). Reduced-motion handled globally via MotionConfig
 * in providers.tsx.
 */
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  type HTMLMotionProps,
} from "motion/react";
import { useEffect, type ReactNode } from "react";

const EASE_EXPO = [0.22, 1, 0.36, 1] as const;

/** Container that staggers its <StaggerItem> children on enter. */
export function StaggerGroup({ children, ...props }: HTMLMotionProps<"ul">) {
  return (
    <motion.ul
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      }}
      {...props}
    >
      {children}
    </motion.ul>
  );
}

/** List item that fades+slides+blurs in, staggered by its parent StaggerGroup. */
export function StaggerItem({ children, ...props }: HTMLMotionProps<"li">) {
  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
        visible: {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          transition: { type: "spring", bounce: 0, duration: 0.4 },
        },
      }}
      {...props}
    >
      {children}
    </motion.li>
  );
}

/**
 * Cross-blur reveal for loading→content transitions (transitions.dev #14).
 * Pass a unique `state` key per visual state (skeleton / error / content /
 * empty). When `state` changes, the old content blurs out and new content
 * blurs in. The skeleton state skips the enter animation (instant appear).
 */
export function Reveal({
  state,
  children,
}: {
  state: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={state === "skeleton" ? false : { opacity: 0, filter: "blur(2px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, filter: "blur(2px)" }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Damped horizontal shake for form validation errors (transitions.dev #12).
 * Fires once when `active` goes false→true. ±8px, 3 oscillations, 400ms.
 */
export function ErrorShake({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const controls = useAnimationControls();

  useEffect(() => {
    if (active) {
      controls.start({
        x: [0, -8, 8, -6, 6, 0],
        transition: { duration: 0.4, ease: "easeInOut" },
      });
    }
  }, [active, controls]);

  return <motion.div animate={controls}>{children}</motion.div>;
}

export { EASE_EXPO };
