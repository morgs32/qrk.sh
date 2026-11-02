import type { ReactNode } from "react";

export function BrickAction(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <div className="pointer-events-none absolute inset-px z-20">
      <div className="brick-action pointer-events-auto absolute right-0 top-0 flex w-max opacity-0 shadow-sm transition-opacity group-hover/brick:opacity-100 group-focus-within/brick:opacity-100 motion-reduce:transition-none">
        {children}
      </div>
    </div>
  );
}
