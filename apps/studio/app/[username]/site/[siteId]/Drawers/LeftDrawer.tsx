"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const drawerTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

export function LeftDrawer(props: { children: ReactNode }) {
  const { children } = props;
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      key="left-drawer"
      data-drawer="left"
      role="dialog"
      aria-hidden={false}
      initial={{ x: "-100%" }}
      animate={{ x: 0 }}
      exit={{ x: "-100%" }}
      transition={reducedMotion ? { duration: 0 } : drawerTransition}
      className="fixed top-0 bottom-0 left-0 z-60 flex h-dvh max-md:w-full min-h-0 flex-col border-r border-border bg-background shadow-[4px_0_20px_-6px_rgb(0_0_0/0.07),2px_0_10px_-4px_rgb(0_0_0/0.04)] md:w-1/2 dark:shadow-[4px_0_20px_-6px_rgb(0_0_0/0.2),2px_0_10px_-4px_rgb(0_0_0/0.1)]"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </motion.div>
  );
}
