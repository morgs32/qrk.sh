"use client";

import { Toolbar } from "@base-ui/react/toolbar";
import { type ReactNode } from "react";
import { cn } from "cn";

export function WallPreviewToolbar(props: {
  children: ReactNode;
  className?: string;
  navigation?: boolean;
  "aria-label": string;
}) {
  const { children, className, navigation = false, "aria-label": ariaLabel } = props;
  // Button radius (--radius - 2px) plus 4px padding and a 1px border.
  const shellClassName = cn(
    "pointer-events-auto flex h-[var(--wall-preview-toolbar-height)] max-w-full shrink-0 items-center justify-center rounded-[calc(var(--radius)_+_3px)] border border-border/80 bg-background px-1 py-1 shadow-md [&>a]:h-7 [&>button]:h-7",
    className,
  );
  return navigation ? (
    <nav aria-label={ariaLabel} className={shellClassName}>
      {children}
    </nav>
  ) : (
    <Toolbar.Root aria-label={ariaLabel} className={shellClassName}>
      {children}
    </Toolbar.Root>
  );
}
