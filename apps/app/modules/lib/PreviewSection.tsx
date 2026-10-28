import type { ReactNode } from "react";
import { cn } from "cn";

/** Share the preview width without clipping editor controls in the surrounding gutter. */
export function PreviewSection(props: { children: ReactNode; className?: string }) {
  const { children, className } = props;
  return (
    <div
      className={cn(
        "@container relative mx-auto box-border w-[calc(var(--wall-preview-width)+2*var(--wall-preview-border-width))] min-w-0 shrink-0 border-x [border-inline-width:var(--wall-preview-border-width)] border-zinc-400/50",
        className,
      )}
    >
      {children}
    </div>
  );
}
