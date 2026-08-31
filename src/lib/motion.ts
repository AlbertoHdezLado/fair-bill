import type { Transition, Variants } from "motion/react";

export const springTransition: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.9,
};

export const fadeTransition: Transition = {
  duration: 0.15,
  ease: "easeOut",
};

export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: fadeTransition },
  exit: { opacity: 0, transition: fadeTransition },
};

/** Bottom sheet on mobile, centered scale-fade on wider screens. */
export const sheetVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: springTransition },
  exit: {
    opacity: 0,
    y: 24,
    scale: 0.98,
    transition: fadeTransition,
  },
};

export const popVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: -6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springTransition },
  exit: { opacity: 0, scale: 0.95, y: -6, transition: fadeTransition },
};

export const fadeInUpVariants: Variants = {
  hidden: { y: 12, scale: 0.99 },
  visible: { y: 0, scale: 1, transition: springTransition },
  exit: { y: -8, scale: 0.99, transition: fadeTransition },
};

export const listStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};
