"use client";

import * as React from "react";
import { Cog, CogIcon, Minus, Pencil, RectangleHorizontal, Type, X } from "lucide-react";

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
  addBricksOpen: boolean;
  editTextOpen: boolean;
  onBricksToolbarClick: () => void;
  onEditTextClick: () => void;
};

export function BottomToolbar({
  addBricksOpen,
  editTextOpen,
  onBricksToolbarClick,
  onEditTextClick,
}: BottomToolbarProps) {
  const isDefault = !editTextOpen && !addBricksOpen;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex items-center rounded-sm border border-border/80 bg-background px-2 py-1 shadow-md">
        <ToolbarGroup>
          <ToolbarButton
            tooltip={editTextOpen ? "Close text editor" : "Edit text"}
            aria-label={editTextOpen ? "Close text editor" : "Edit text"}
            onClick={onEditTextClick}
            className={cn(
              "h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground",
              editTextOpen && "text-destructive hover:text-destructive",
            )}
          >
            {editTextOpen ? (
              <X className="!size-4 shrink-0" strokeWidth={2} aria-hidden />
            ) : (
              <Type className="h-3.5 w-3.5" />
            )}
            {editTextOpen ? "Close" : "Edit text"}
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup>
          <ToolbarButton
            tooltip={addBricksOpen ? "Close bricks drawer" : "Edit bricks"}
            aria-label={addBricksOpen ? "Close bricks drawer" : "Edit bricks"}
            onClick={onBricksToolbarClick}
            className={cn(
              "h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground",
              addBricksOpen && "text-destructive hover:text-destructive",
            )}
          >
            {addBricksOpen ? (
              <X className="!size-4 shrink-0" strokeWidth={2} aria-hidden />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
            {addBricksOpen ? "Close" : "Edit bricks"}
          </ToolbarButton>
        </ToolbarGroup>

        {isDefault && (
          <>
            <ToolbarSeparator />

            <ToolbarGroup>
              <ToolbarButton
                tooltip="Edit header"
                aria-label="Edit header"
                className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
              >
                <Minus className="h-3.5 w-3.5" />
                Edit header
              </ToolbarButton>
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
              <ToolbarButton
                tooltip="Set breakpoints"
                aria-label="Set breakpoints"
                className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
              >
                <RectangleHorizontal className="h-3.5 w-3.5" />
                Set breakpoints
              </ToolbarButton>
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
              <ToolbarButton
                tooltip="Page settings"
                aria-label="Page settings"
                className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
              >
                <Cog className="h-3.5 w-3.5" />
                Page settings
              </ToolbarButton>
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
              <ToolbarButton
                tooltip="Site settings"
                aria-label="Site settings"
                className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
              >
                <CogIcon className="h-3.5 w-3.5" />
                Site settings
              </ToolbarButton>
            </ToolbarGroup>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
