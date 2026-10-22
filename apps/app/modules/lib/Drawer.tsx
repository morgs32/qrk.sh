"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
  animated?: boolean;
  open?: boolean;
  children: ReactNode;
  className?: string;
  layoutMode?: "overlay" | "flow";
  "aria-label"?: string;
}) {
  const {
    side,
    children,
    className,
    layoutMode = "overlay",
    animated = true,
    open,
    "aria-label": ariaLabel,
  } = props;
  const reducedMotion = useReducedMotion();
  const surface = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const hadFocus = useRef(false);
  const [present, setPresent] = useState(open ?? true);
  if (open === true && !present) setPresent(true);

  useLayoutEffect(() => {
    const element = surface.current;
    if (open === undefined || element === null) return;
    if (open) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && !element.contains(active)) {
        returnFocus.current = active;
      }
      return;
    }

    // Route navigation can remove the focused child before this effect runs.
    if (
      hadFocus.current &&
      (document.activeElement === document.body || element.contains(document.activeElement))
    ) {
      const previous = returnFocus.current;
      const target = previous?.isConnected
        ? previous
        : previous instanceof HTMLAnchorElement
          ? [...document.querySelectorAll("a")].find((link) => link.href === previous.href)
          : undefined;
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }
    hadFocus.current = false;

    // No transition event fires for reduced motion or a reversal before first paint.
    if (
      !animated ||
      reducedMotion ||
      !element
        .getAnimations()
        .some(
          (animation) =>
            animation instanceof CSSTransition && animation.transitionProperty === "transform",
        )
    )
      setPresent(false);
  }, [open, animated, reducedMotion]);

  const isFlow = layoutMode === "flow";
  const motionProps = open !== undefined || isFlow || !animated ? undefined : sideMotion[side];

  return (
    <motion.div
      ref={surface}
      key={`${side}-drawer`}
      data-drawer={side}
      role="dialog"
      aria-label={ariaLabel}
      data-state={open === undefined ? undefined : open ? "open" : "closed"}
      aria-hidden={open === false}
      inert={open === false}
      onFocusCapture={() => {
        hadFocus.current = true;
      }}
      onBlurCapture={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          hadFocus.current = false;
        }
      }}
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === "transform" &&
          open === false
        ) {
          setPresent(false);
        }
      }}
      style={
        open === undefined
          ? undefined
          : {
              ...(side === "bottom" ? { top: "auto", height: "50dvh" } : {}),
              transform: open
                ? "translate(0, 0)"
                : side === "bottom"
                  ? "translateY(100%)"
                  : side === "left"
                    ? "translateX(-100%)"
                    : "translateX(100%)",
              transition:
                animated && !reducedMotion ? "transform 300ms cubic-bezier(0, 0, 0.2, 1)" : "none",
              visibility: open || present ? "visible" : "hidden",
              pointerEvents: open ? undefined : "none",
            }
      }
      initial={motionProps?.initial}
      animate={motionProps?.animate}
      exit={motionProps?.exit}
      transition={reducedMotion ? { duration: 0 } : drawerTransition}
      className={cn(
        sideClassName[side],
        isFlow && "relative inset-auto top-auto z-60 h-full max-md:w-full shadow-none md:h-full",
        className,
      )}
    >
      {open === undefined || open || present ? children : null}
    </motion.div>
  );
}
