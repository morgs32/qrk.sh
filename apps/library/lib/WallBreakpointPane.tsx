import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { cn } from "cn";
import { LockKeyhole } from "lucide-react";

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
    breakpoint,
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

  const isMobile = breakpoint === "sm" || breakpoint === "md";

  return (
    <motion.div
      animate={controls}
      hidden={!isOnStage}
      inert={!isActive}
      className={cn(isOutgoing && "absolute inset-x-0 top-0", isActive && "relative w-full")}
    >
      <div
        className="relative mx-auto [--wall-chrome-height:3rem]"
        style={{ width: previewWidth }}
        data-wall-breakpoint={breakpoint}
        data-wall-active={isActive}
      >
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none relative flex h-12 translate-y-[var(--wall-drag-scroll-offset,0px)] items-center justify-center border-b border-zinc-300/70 bg-zinc-100 px-3",
            isMobile ? "rounded-t-2xl" : "rounded-t-xl",
          )}
        >
          {!isMobile && (
            <div className="absolute left-4 flex gap-1.5">
              <span className="size-2.5 rounded-full bg-red-400" />
              <span className="size-2.5 rounded-full bg-amber-400" />
              <span className="size-2.5 rounded-full bg-green-400" />
            </div>
          )}
          <div
            className={cn(
              "flex h-8 items-center justify-center gap-1.5 bg-white/80 text-xs text-zinc-500 shadow-sm",
              isMobile ? "w-full rounded-xl" : "w-1/2 max-w-lg rounded-md",
            )}
          >
            <LockKeyhole size={12} strokeWidth={1.5} />
            <span>qrk.sh</span>
          </div>
        </div>
        {children}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 z-10 translate-y-[var(--wall-drag-scroll-offset,0px)] shadow-[inset_0_0_0_1px_rgba(161,161,170,0.5)]",
            isMobile ? "rounded-2xl" : "rounded-xl",
          )}
        />
      </div>
    </motion.div>
  );
}
