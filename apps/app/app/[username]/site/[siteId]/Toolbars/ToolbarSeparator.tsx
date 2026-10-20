"use client";

import { cn } from "cn";

export function ToolbarSeparator(props: { collapsed?: boolean }) {
  const { collapsed } = props;
  return (
    <div
      className={cn(
        "shrink-0 bg-border",
        collapsed ? "h-5 w-0 min-w-0 overflow-hidden" : "h-5 w-px",
      )}
      aria-hidden
    />
  );
}
