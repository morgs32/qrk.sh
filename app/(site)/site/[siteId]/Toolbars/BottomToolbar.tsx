"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ToolbarButtonLegacyProps = {
  tooltip?: string;
  variant?: "default" | "ghost";
  asChild?: boolean;
  children: React.ReactNode;
  label?: never;
  icon?: never;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">;

export type ToolbarButtonLabeledProps = {
  label: string;
  icon: React.ReactNode;
  isActive?: boolean;
  activeLabel?: string;
  activeIcon?: React.ReactNode;
  href?: string;
  activeDestructive?: boolean;
  tooltip?: string;
  variant?: "default" | "ghost";
  children?: never;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">;

export type ToolbarButtonProps = ToolbarButtonLegacyProps | ToolbarButtonLabeledProps;

function isLabeledToolbarButton(props: ToolbarButtonProps): props is ToolbarButtonLabeledProps {
  return "label" in props && "icon" in props;
}

function ToolbarLabeledButton({
  label,
  icon,
  isActive = false,
  activeLabel,
  activeIcon,
  href,
  activeDestructive = false,
  tooltip,
  variant = "ghost",
  className,
  ...rest
}: ToolbarButtonLabeledProps) {
  const displayLabel = isActive && activeLabel !== undefined ? activeLabel : label;
  const displayIcon = isActive && activeIcon !== undefined ? activeIcon : icon;
  const tip = tooltip ?? displayLabel;
  const ariaLabel = rest["aria-label"] ?? displayLabel;

  const contentClassName = cn(
    "h-8 px-2 text-muted-foreground hover:text-foreground",
    variant === "default" &&
      "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
    isActive && activeDestructive && "text-destructive hover:text-destructive",
    className,
  );

  const body = (
    <>
      {displayIcon}
      {displayLabel}
    </>
  );

  const { "aria-label": _a, ...buttonProps } = rest;

  function wrapTooltip(trigger: React.ReactElement) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          {tip}
        </TooltipContent>
      </Tooltip>
    );
  }

  function renderTrigger() {
    if (href !== undefined && href !== "") {
      return (
        <Button asChild variant={variant} size="sm" className={contentClassName}>
          <Link href={href} aria-label={typeof ariaLabel === "string" ? ariaLabel : undefined}>
            {body}
          </Link>
        </Button>
      );
    }
    return (
      <Button
        type="button"
        variant={variant}
        size="sm"
        className={contentClassName}
        aria-label={ariaLabel}
        {...buttonProps}
      >
        {body}
      </Button>
    );
  }

  return wrapTooltip(renderTrigger());
}

export function ToolbarButton(props: ToolbarButtonProps) {
  if (isLabeledToolbarButton(props)) {
    return <ToolbarLabeledButton {...props} />;
  }

  const { tooltip, variant = "ghost", asChild, children, className, ...rest } = props;
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
      {...rest}
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
