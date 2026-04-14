"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip?: string;
  variant?: "default" | "ghost";
  asChild?: boolean;
  children: React.ReactNode;
}

export function ToolbarButton({
  tooltip,
  variant = "ghost",
  asChild,
  children,
  className,
  ...props
}: ToolbarButtonProps) {
  const button = (
    <Button
      type={asChild ? undefined : "button"}
      asChild={asChild}
      variant={variant}
      size="sm"
      className={cn(
        "h-8 px-2 text-muted-foreground hover:text-foreground",
        variant === "default" &&
          "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

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
          "flex items-center rounded-sm border border-border/80 bg-background px-2 py-1 shadow-md",
          className,
        )}
      >
        {children}
      </div>
    </TooltipProvider>
  );
}
