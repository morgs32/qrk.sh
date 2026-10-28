import { cn } from "cn";
import { LockKeyhole } from "lucide-react";
import { PreviewSection } from "./PreviewSection";

export function BrowserChrome(props: { breakpoint: "sm" | "md" | "lg" | "xl" }) {
  const { breakpoint } = props;
  const isMobile = breakpoint === "sm" || breakpoint === "md";

  return (
    <PreviewSection
      className={cn(
        "pointer-events-none sticky top-0 z-60 flex h-12 shrink-0 items-center justify-center border-t border-b border-t-zinc-400/50 border-b-zinc-300/70 bg-zinc-100 px-3",
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
    </PreviewSection>
  );
}
