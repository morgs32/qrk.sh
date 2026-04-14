"use client";

import * as React from "react";
import type { RoutePattern } from "@remix-run/route-pattern";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { pagePattern, pathnameToMatchUrl } from "../../../routePatterns";

function routePatternsActive(
  matchPattern: RoutePattern | readonly RoutePattern[],
  url: URL,
): boolean {
  const list = Array.isArray(matchPattern) ? matchPattern : [matchPattern];
  return list.some((p) => p.test(url));
}

/** Inactive `href` uses the first pattern (single pattern or tuple); active always exits to `pagePattern`. */
function enterPatternFromMatch(matchPattern: RoutePattern | readonly RoutePattern[]): RoutePattern {
  return (Array.isArray(matchPattern) ? matchPattern[0] : matchPattern) as RoutePattern;
}

type BaseToolbarButtonProps = {
  kind?: undefined;
  tooltip?: string;
  variant?: "default" | "ghost";
  asChild?: boolean;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">;

export type RouteToolbarButtonProps = {
  kind: "route";
  matchPattern: RoutePattern | readonly RoutePattern[];
  hrefParams: { siteId: string; pageId: string };
  activeLabel: string;
  inactiveLabel: string;
  activeIcon: React.ReactNode;
  inactiveIcon: React.ReactNode;
  activeDestructive?: boolean;
  variant?: "default" | "ghost";
  className?: string;
};

export type ToolbarButtonProps = BaseToolbarButtonProps | RouteToolbarButtonProps;

function ToolbarRouteButton({
  matchPattern,
  hrefParams,
  activeLabel,
  inactiveLabel,
  activeIcon,
  inactiveIcon,
  activeDestructive = false,
  variant = "ghost",
  className,
}: RouteToolbarButtonProps) {
  const pathname = usePathname();
  const url = pathnameToMatchUrl(pathname);
  const active = routePatternsActive(matchPattern, url);
  const href = active
    ? pagePattern.href(hrefParams)
    : enterPatternFromMatch(matchPattern).href(hrefParams);
  const label = active ? activeLabel : inactiveLabel;
  const icon = active ? activeIcon : inactiveIcon;

  const button = (
    <Button
      asChild
      variant={variant}
      size="sm"
      className={cn(
        "h-8 px-2 text-muted-foreground hover:text-foreground",
        variant === "default" &&
          "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
        active && activeDestructive && "text-destructive hover:text-destructive",
        className,
      )}
    >
      <Link href={href} aria-label={label}>
        {icon}
        {label}
      </Link>
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function ToolbarButton(props: ToolbarButtonProps) {
  if (props.kind === "route") {
    return <ToolbarRouteButton {...props} />;
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
