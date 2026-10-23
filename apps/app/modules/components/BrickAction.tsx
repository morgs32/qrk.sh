import type { ReactNode } from "react";

export function BrickAction(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <div className="brick-action absolute right-px top-px z-20 flex bg-zinc-800 text-white opacity-0 shadow-sm transition-opacity group-hover/brick:opacity-100 group-focus-within/brick:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100">
      {children}
    </div>
  );
}
