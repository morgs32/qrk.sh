"use client";

import * as React from "react";
import { Type } from "lucide-react";

import { useProseDrawerStore } from "@/components/home/useProseDrawerStore";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip?: string;
  variant?: "default" | "ghost";
  children: React.ReactNode;
}

function ToolbarButton({
  tooltip,
  variant = "ghost",
  children,
  className,
  ...props
}: ToolbarButtonProps) {
  const button = (
    <Button
      type="button"
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

function ToolbarGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-0.5", className)}>{children}</div>;
}

export function LeftBottomToolbar() {
  const setOpen = useProseDrawerStore((s) => s.setOpen);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1.5 shadow-lg">
        <ToolbarGroup>
          <ToolbarButton tooltip="Edit text" aria-label="Edit text" onClick={() => setOpen(true)}>
            <Type className="h-4 w-4" />
            Edit text
          </ToolbarButton>
        </ToolbarGroup>
      </div>
    </TooltipProvider>
  );
}
