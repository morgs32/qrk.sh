import * as React from "react";

import { cn } from "@/lib/utils";

/** Frosted circular control: inset highlight + soft outer shadow (works on busy backgrounds). */
export function SoftButton({
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      data-slot="soft-button"
      className={cn(
        "inline-flex cursor-pointer items-center justify-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "group relative h-14 w-14 shrink-0 rounded-full bg-black/30 backdrop-blur-sm shadow-[inset_0_2px_4px_rgba(255,255,255,0.1),0_4px_16px_rgba(0,0,0,0.3)] transition-all duration-200",
        "hover:shadow-[inset_0_2px_4px_rgba(255,255,255,0.15),0_8px_24px_rgba(0,0,0,0.4)] hover:scale-105 active:scale-95 active:shadow-none",
        className,
      )}
      {...props}
    />
  );
}
