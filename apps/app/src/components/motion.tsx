/**
 * Motion primitives for list/page animations.
 *
 * Uses `motion/react` (motion v11+). Brand easing: cubic-bezier(0.22, 1, 0.36, 1)
 * (DESIGN.md §08 --ease-expo). Reduced-motion handled globally via MotionConfig
 * in providers.tsx.
 */
import { motion, type HTMLMotionProps } from "motion/react";

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
          transition: { duration: 0.3, ease: EASE_EXPO },
        },
      }}
      {...props}
    >
      {children}
    </motion.li>
  );
}

export { EASE_EXPO };
