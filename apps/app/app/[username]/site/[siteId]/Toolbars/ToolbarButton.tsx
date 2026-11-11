"use client";

import { Link } from "@tanstack/react-router";

import * as React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

const toolbarButtonClassName =
  "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

type IToolbarButtonLegacyProps = {
  tooltip?: string;
  children: React.ReactNode;
  label?: never;
  icon?: never;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">;

type IToolbarButtonLabeledProps = {
  label: string;
  icon: React.ReactNode;
  link?:
    | { to: "/$username"; params: { username: string } }
    | {
        to:
          | "/$username/site/$siteId/page/$pageId/modules"
          | "/$username/site/$siteId/page/$pageId/breakpoints"
          | "/$username/site/$siteId/page/$pageId/page-settings"
          | "/$username/site/$siteId/page/$pageId/site-settings";
        params: { username: string; siteId: string; pageId: string };
        search: { breakpoint?: string };
      };
  children?: never;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">;

type IToolbarButtonProps = IToolbarButtonLegacyProps | IToolbarButtonLabeledProps;

function isLabeledToolbarButton(props: IToolbarButtonProps): props is IToolbarButtonLabeledProps {
  const { ...buttonProps } = props;
  return "label" in buttonProps && "icon" in buttonProps;
}

function ToolbarLabeledButton(props: IToolbarButtonLabeledProps) {
  const {
    label,
    icon,
    link,
    className,
    "aria-label": providedAriaLabel,
    type: _type,
    ...buttonProps
  } = props;
  const ariaLabel = providedAriaLabel ?? label;
  const mergedClassName = cn(toolbarButtonClassName, className);

  const body = (
    <>
      {icon}
      {label}
    </>
  );

  return link !== undefined ? (
    <Link {...link} resetScroll={false} aria-label={ariaLabel} className={mergedClassName}>
      {body}
    </Link>
  ) : (
    <button type="button" aria-label={ariaLabel} className={mergedClassName} {...buttonProps}>
      {body}
    </button>
  );
}

export function ToolbarButton(props: IToolbarButtonProps) {
  const { ...buttonProps } = props;
  if (isLabeledToolbarButton(buttonProps)) {
    return <ToolbarLabeledButton {...buttonProps} />;
  }

  const { tooltip, children, className, type = "button", ...rest } = buttonProps;
  const button = (
    <button type={type} className={cn(toolbarButtonClassName, className)} {...rest}>
      {children}
    </button>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent side="top" sideOffset={8}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
