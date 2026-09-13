"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "cn";
import type { ReactNode } from "react";

const drawerTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

const COMPOSE_ARIA_LABEL = "Compose drawer";

export function RightDrawer(props: { children: ReactNode }) {
  const { children } = props;
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      key="right-drawer"
      data-drawer="right"
      role="dialog"
      aria-label={COMPOSE_ARIA_LABEL}
      aria-hidden={false}
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={reducedMotion ? { duration: 0 } : drawerTransition}
      className={cn(
        "fixed top-16 right-0 bottom-0 z-40 flex h-[calc(100vh-4rem)] w-full min-h-0 flex-col border-l border-border bg-background shadow-[-4px_0_20px_-6px_rgb(0_0_0/0.07),-2px_0_10px_-4px_rgb(0_0_0/0.04)] md:w-1/2 dark:shadow-[-4px_0_20px_-6px_rgb(0_0_0/0.2),-2px_0_10px_-4px_rgb(0_0_0/0.1)]",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </motion.div>
  );
}
