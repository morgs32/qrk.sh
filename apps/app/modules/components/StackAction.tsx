import type { ReactNode } from "react";

export function StackAction(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <div className="absolute left-0 top-0 z-30 flex h-7 max-w-[calc(100%-3.5rem)] items-center gap-1 bg-background/95 text-xs text-muted-foreground opacity-0 transition-opacity group-hover/stack:opacity-100 group-focus-within/stack:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100">
      {children}
    </div>
  );
}
