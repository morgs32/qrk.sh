"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "cn";
import type { ReactNode } from "react";

const drawerTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

export function BottomDrawer(props: { children: ReactNode }) {
  const { children } = props;
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      key="bottom-drawer"
      data-drawer="bottom"
      role="dialog"
      aria-hidden={false}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={reducedMotion ? { duration: 0 } : drawerTransition}
      className={cn(
        "fixed right-0 bottom-0 left-0 z-40 flex min-h-0 w-full flex-col border-t border-border bg-background shadow-[0_-4px_20px_-6px_rgb(0_0_0/0.07),0_-2px_10px_-4px_rgb(0_0_0/0.04)] top-16 md:top-auto md:h-[calc((100vh-4rem)/2)] dark:shadow-[0_-4px_20px_-6px_rgb(0_0_0/0.2),0_-2px_10px_-4px_rgb(0_0_0/0.1)]",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </motion.div>
  );
}
