import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { cn } from "cn";

const wallSlideTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

export function WallBreakpointPane(props: {
  children: ReactNode;
  breakpoint: "sm" | "md" | "lg" | "xl";
  previewWidth: number;
  isActive: boolean;
  isOutgoing: boolean;
  isOnStage: boolean;
  isTransitioning: boolean;
  direction: 1 | -1 | 0;
  reducedMotion: boolean;
  onOutgoingComplete: () => void;
}) {
  const {
    children,
    previewWidth,
    isActive,
    isOutgoing,
    isOnStage,
    isTransitioning,
    direction,
    reducedMotion,
    onOutgoingComplete,
  } = props;
  const controls = useAnimationControls();
  const onOutgoingCompleteRef = useRef(onOutgoingComplete);
  useEffect(() => {
    onOutgoingCompleteRef.current = onOutgoingComplete;
  });

  useLayoutEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isOnStage) {
        await controls.set({ x: 0 });
        return;
      }

      if (reducedMotion || direction === 0 || !isTransitioning) {
        await controls.set({ x: 0 });
        if (isOutgoing && !cancelled) onOutgoingCompleteRef.current();
        return;
      }

      if (isOutgoing) {
        await controls.start({
          x: direction === 1 ? "-100%" : "100%",
          transition: wallSlideTransition,
        });
        if (!cancelled) onOutgoingCompleteRef.current();
        return;
      }

      if (isActive) {
        await controls.set({ x: direction === 1 ? "100%" : "-100%" });
        if (cancelled) return;
        await controls.start({ x: 0, transition: wallSlideTransition });
      }
    }

    void run();
    return () => {
      cancelled = true;
      controls.stop();
    };
  }, [controls, direction, isActive, isOnStage, isOutgoing, isTransitioning, reducedMotion]);

  return (
    <motion.div
      animate={controls}
      hidden={!isOnStage}
      inert={!isActive}
      className={cn(isOutgoing && "absolute inset-x-0 top-0", isActive && "relative w-full")}
    >
      <div
        className="mx-auto"
        style={{ width: previewWidth }}
        data-wall-breakpoint={props.breakpoint}
        data-wall-active={isActive}
      >
        {children}
      </div>
    </motion.div>
  );
}
