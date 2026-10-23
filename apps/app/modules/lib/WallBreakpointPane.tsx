import type { ReactNode } from "react";
import { cn } from "cn";
import { LockKeyhole } from "lucide-react";

export function WallBreakpointPane(props: {
  children: ReactNode;
  breakpoint: "sm" | "md" | "lg" | "xl";
  previewWidth: number;
}) {
  const { children, breakpoint, previewWidth } = props;
  const isMobile = breakpoint === "sm" || breakpoint === "md";

  return (
    <div
      className={cn(
        "relative mx-auto flex h-[var(--wall-frame-height)] flex-col overflow-clip",
        isMobile ? "rounded-2xl" : "rounded-xl",
      )}
      style={{ width: previewWidth }}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none relative flex h-12 shrink-0 items-center justify-center border-b border-zinc-300/70 bg-zinc-100 px-3",
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
          "pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_0_1px_rgba(161,161,170,0.5)]",
          isMobile ? "rounded-2xl" : "rounded-xl",
        )}
      />
    </div>
  );
}
