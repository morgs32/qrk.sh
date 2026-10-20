"use client";

import { type ReactNode } from "react";
import { cn } from "cn";

export function WallPreviewToolbar(props: {
  children: ReactNode;
  className?: string;
  "aria-label": string;
}) {
  const { children, className, "aria-label": ariaLabel } = props;
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className={cn(
        "pointer-events-auto flex h-[var(--wall-preview-toolbar-height)] max-w-full shrink-0 items-center justify-center rounded-sm border border-border/80 bg-background px-1 py-1 shadow-md [&>a]:h-7 [&>button]:h-7",
        className,
      )}
    >
      {children}
    </div>
  );
}
