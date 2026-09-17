"use client";

import { Fragment, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "cn";

const drawerTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

const sideMotion = {
  left: {
    initial: { x: "-100%" },
    animate: { x: 0 },
    exit: { x: "-100%" },
  },
  right: {
    initial: { x: "100%" },
    animate: { x: 0 },
    exit: { x: "100%" },
  },
  bottom: {
    initial: { y: "100%" },
    animate: { y: 0 },
    exit: { y: "100%" },
  },
};

const sideClassName = {
  left: "fixed top-0 bottom-0 left-0 z-60 flex h-dvh max-md:w-full min-h-0 flex-col border-r border-border bg-background shadow-[4px_0_20px_-6px_rgb(0_0_0/0.07),2px_0_10px_-4px_rgb(0_0_0/0.04)] md:w-1/2 dark:shadow-[4px_0_20px_-6px_rgb(0_0_0/0.2),2px_0_10px_-4px_rgb(0_0_0/0.1)]",
  right:
    "fixed top-0 right-0 bottom-0 z-60 flex h-dvh max-md:w-full min-h-0 flex-col border-l border-border bg-background shadow-[-4px_0_20px_-6px_rgb(0_0_0/0.07),-2px_0_10px_-4px_rgb(0_0_0/0.04)] md:w-1/2 dark:shadow-[-4px_0_20px_-6px_rgb(0_0_0/0.2),-2px_0_10px_-4px_rgb(0_0_0/0.1)]",
  bottom:
    "fixed right-0 bottom-0 left-0 z-40 flex min-h-0 w-full flex-col border-t border-border bg-background shadow-[0_-4px_20px_-6px_rgb(0_0_0/0.07),0_-2px_10px_-4px_rgb(0_0_0/0.04)] top-16 md:top-auto md:h-[calc((100vh-4rem)/2)] dark:shadow-[0_-4px_20px_-6px_rgb(0_0_0/0.2),0_-2px_10px_-4px_rgb(0_0_0/0.1)]",
};

export function Drawer(props: {
  side: "left" | "right" | "bottom";
  children: ReactNode;
  className?: string;
  layoutMode?: "overlay" | "flow";
  "aria-label"?: string;
}) {
  const { side, children, className, layoutMode = "overlay" } = props;
  const reducedMotion = useReducedMotion();
  const isFlow = layoutMode === "flow";
  const motionProps = isFlow ? undefined : sideMotion[side];

  return (
    <motion.div
      key={`${side}-drawer`}
      data-drawer={side}
      role="dialog"
      aria-label={props["aria-label"]}
      aria-hidden={false}
      initial={motionProps?.initial}
      animate={motionProps?.animate}
      exit={motionProps?.exit}
      transition={reducedMotion ? { duration: 0 } : drawerTransition}
      className={cn(
        sideClassName[side],
        isFlow &&
          "relative inset-auto top-auto z-60 h-full max-md:w-full shadow-none md:h-full",
        className,
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </motion.div>
  );
}

export function DrawerPresence(props: { group: string; children: ReactNode }) {
  const { group, children } = props;

  return (
    <AnimatePresence mode="sync">
      <Fragment key={group}>{children}</Fragment>
    </AnimatePresence>
  );
}
