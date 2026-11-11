import type { ReactNode } from "react";

export function StackAction(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <div className="pointer-events-none absolute inset-px z-30">
      <div className="stack-action pointer-events-auto sticky top-[var(--wall-actions-sticky-top)] w-max max-w-[calc(100%-3.5rem)] opacity-0 transition-opacity has-[[data-popup-open]]:opacity-100 group-hover/stack:opacity-100 group-focus-within/stack:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100">
        {children}
      </div>
    </div>
  );
}
