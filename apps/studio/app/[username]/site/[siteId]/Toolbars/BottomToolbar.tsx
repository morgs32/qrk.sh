"use client";

import * as React from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "cn";

export function ToolbarSeparator({ collapsed }: { collapsed?: boolean }) {
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

export function BottomToolbar({
  children,
  className,
}: Readonly<{
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "flex items-center rounded-sm border border-border/80 bg-background py-1 shadow-md",
          className,
        )}
      >
        {children}
      </div>
    </TooltipProvider>
  );
}
