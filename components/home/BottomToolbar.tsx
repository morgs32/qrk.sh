"use client";

import * as React from "react";
import { Plus } from "lucide-react";

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

function ToolbarSeparator() {
  return <div className="mx-1.5 h-5 w-px bg-border" />;
}

export type BottomToolbarProps = {
  onAddClick: () => void;
};

export function BottomToolbar({ onAddClick }: BottomToolbarProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1.5 shadow-lg">
        {/* <ToolbarGroup>
          <ToolbarButton tooltip="Add Text" variant="default">
            Add Text
            <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded bg-primary-foreground/20 text-xs font-medium">
              T
            </span>
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup>
          <ToolbarButton tooltip="Layout Grid">
            <LayoutGrid className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton tooltip="Typography">
            <Type className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton tooltip="Add Image">
            <ImageIcon className="h-4 w-4" />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarSeparator /> */}

        <ToolbarGroup>
          <ToolbarButton tooltip="Add tiles" aria-label="Add tiles" onClick={onAddClick}>
            <Plus className="h-4 w-4" />
            Add tiles
          </ToolbarButton>
        </ToolbarGroup>
      </div>
    </TooltipProvider>
  );
}
