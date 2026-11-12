"use client";

import { Toolbar } from "@base-ui/react/toolbar";
import { Link } from "@tanstack/react-router";

import * as React from "react";

import { Button } from "@qrk.sh/bricks/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

const toolbarButtonClassName =
  "relative h-[calc(100%-1px)] flex-1 cursor-pointer gap-1.5 rounded-md border border-transparent px-2.5 py-0.5 text-sm font-medium text-foreground/60 hover:bg-transparent hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring active:not-aria-[haspopup]:translate-y-0 disabled:aria-pressed:opacity-100 dark:text-muted-foreground dark:hover:bg-transparent dark:hover:text-foreground aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=page]:shadow-sm aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm dark:aria-[current=page]:border-input dark:aria-[current=page]:bg-input/30 dark:aria-[current=page]:text-foreground dark:aria-pressed:border-input dark:aria-pressed:bg-input/30 dark:aria-pressed:text-foreground group-data-[size=sm]/preview-toolbar:px-1.5 group-data-[size=sm]/preview-toolbar:text-[12px]";

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
    "aria-current": ariaCurrent,
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
    <Button
      variant="ghost"
      nativeButton={false}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      className={mergedClassName}
      render={<Link {...link} resetScroll={false} role="link" />}
    >
      {body}
    </Button>
  ) : (
    <Toolbar.Button render={<Button variant="ghost" />} type="button" aria-label={ariaLabel} className={mergedClassName} {...buttonProps}>
      {body}
    </Toolbar.Button>
  );
}

export function ToolbarButton(props: IToolbarButtonProps) {
  const { ...buttonProps } = props;
  if (isLabeledToolbarButton(buttonProps)) {
    return <ToolbarLabeledButton {...buttonProps} />;
  }

  const { tooltip, children, className, type = "button", ...rest } = buttonProps;
  const button = (
    <Toolbar.Button render={<Button variant="ghost" />} type={type} className={cn(toolbarButtonClassName, className)} {...rest}>
      {children}
    </Toolbar.Button>
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
