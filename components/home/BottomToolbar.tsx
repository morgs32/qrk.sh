"use client";

import * as React from "react";
import { Plus, Type, X } from "lucide-react";

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

function ToolbarSeparator({ collapsed }: { collapsed?: boolean }) {
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

export type BottomToolbarProps = {
  addTilesOpen: boolean;
  editTextOpen: boolean;
  onTilesToolbarClick: () => void;
  onEditTextClick: () => void;
};

export function BottomToolbar({
  addTilesOpen,
  editTextOpen,
  onTilesToolbarClick,
  onEditTextClick,
}: BottomToolbarProps) {
  const drawerOpen = editTextOpen || addTilesOpen;

  const editTextClose = (
    <ToolbarButton
      onClick={onEditTextClick}
      className="h-8 w-full min-w-0 justify-center gap-1.5 text-destructive hover:text-destructive"
    >
      <X className="!size-5 shrink-0 text-destructive" strokeWidth={2} aria-hidden />
      Close
    </ToolbarButton>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center rounded-lg border bg-background px-2 py-1.5 shadow-lg">
        <div className="flex min-h-0 min-w-0 w-full justify-end pr-1.5">
          <ToolbarGroup className="w-full min-w-0">
            {editTextOpen ? (
              editTextClose
            ) : (
              <ToolbarButton
                tooltip="Edit text"
                aria-label="Edit text"
                onClick={onEditTextClick}
                className="w-full justify-end"
              >
                <Type className="h-4 w-4" />
                Edit text
              </ToolbarButton>
            )}
          </ToolbarGroup>
        </div>

        <ToolbarSeparator collapsed={drawerOpen} />

        <div className="flex min-h-0 min-w-0 w-full justify-start pl-1.5">
          <ToolbarGroup className="w-full min-w-0">
            {addTilesOpen ? (
              <ToolbarButton
                onClick={onTilesToolbarClick}
                className="h-8 w-full min-w-0 justify-center gap-1.5 text-destructive hover:text-destructive"
              >
                <X className="!size-5 shrink-0 text-destructive" strokeWidth={2} aria-hidden />
                Close
              </ToolbarButton>
            ) : (
              <ToolbarButton
                tooltip="Add tiles"
                aria-label="Add tiles"
                onClick={onTilesToolbarClick}
                className="w-full justify-start"
              >
                <Plus className="h-4 w-4" />
                Add tiles
              </ToolbarButton>
            )}
          </ToolbarGroup>
        </div>

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

      </div>
    </TooltipProvider>
  );
}
