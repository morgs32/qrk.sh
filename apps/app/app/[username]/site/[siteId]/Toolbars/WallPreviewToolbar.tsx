"use client";

import { Toolbar } from "@base-ui/react/toolbar";
import { type ReactNode } from "react";
import { cn } from "cn";

export function WallPreviewToolbar(props: {
  children: ReactNode;
  className?: string;
  navigation?: boolean;
  size?: "default" | "sm";
  variant?: "default" | "shadow";
  "aria-label": string;
}) {
  const {
    children,
    className,
    navigation = false,
    size = "default",
    variant = "default",
    "aria-label": ariaLabel,
  } = props;
  const shellClassName = cn(
    "group/preview-toolbar pointer-events-auto flex max-w-full shrink-0 items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground",
    size === "sm" ? "h-8 gap-0" : "h-9 gap-1",
    variant === "shadow" && "border border-zinc-200 shadow-md dark:border-zinc-800",
    className,
  );
  return navigation ? (
    <nav aria-label={ariaLabel} data-size={size} className={shellClassName}>
      {children}
    </nav>
  ) : (
    <Toolbar.Root aria-label={ariaLabel} data-size={size} className={shellClassName}>
      {children}
    </Toolbar.Root>
  );
}
