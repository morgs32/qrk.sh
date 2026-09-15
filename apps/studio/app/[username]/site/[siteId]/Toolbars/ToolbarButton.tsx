"use client";

import * as React from "react";
import { Link } from "react-router";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

const toolbarButtonClassName =
  "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

type ToolbarButtonLegacyProps = {
  tooltip?: string;
  children: React.ReactNode;
  label?: never;
  icon?: never;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">;

type ToolbarButtonLabeledProps = {
  label: string;
  icon: React.ReactNode;
  isActive?: boolean;
  activeLabel?: string;
  activeIcon?: React.ReactNode;
  href?: string;
  activeDestructive?: boolean;
  tooltip?: string;
  showTooltip?: boolean;
  children?: never;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">;

type ToolbarButtonProps = ToolbarButtonLegacyProps | ToolbarButtonLabeledProps;

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
  showTooltip = false,
  className,
  ...rest
}: ToolbarButtonLabeledProps) {
  const displayLabel = isActive && activeLabel !== undefined ? activeLabel : label;
  const displayIcon = isActive && activeIcon !== undefined ? activeIcon : icon;
  const tip = tooltip ?? displayLabel;
  const ariaLabel = rest["aria-label"] ?? displayLabel;

  const mergedClassName = cn(
    toolbarButtonClassName,
    isActive && activeDestructive && "text-destructive hover:text-destructive",
    className,
  );

  const body = (
    <>
      {displayIcon}
      {displayLabel}
    </>
  );

  const { "aria-label": _a, type: _type, ...buttonProps } = rest;
  const hasHref = href !== undefined && href !== "";

  const control = hasHref ? (
    <Link to={href} aria-label={ariaLabel} className={mergedClassName}>
      {body}
    </Link>
  ) : (
    <button type="button" aria-label={ariaLabel} className={mergedClassName} {...buttonProps}>
      {body}
    </button>
  );

  if (!showTooltip) {
    return control;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

export function ToolbarButton(props: ToolbarButtonProps) {
  if (isLabeledToolbarButton(props)) {
    return <ToolbarLabeledButton {...props} />;
  }

  const { tooltip, children, className, type = "button", ...rest } = props;
  const button = (
    <button type={type} className={cn(toolbarButtonClassName, className)} {...rest}>
      {children}
    </button>
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
