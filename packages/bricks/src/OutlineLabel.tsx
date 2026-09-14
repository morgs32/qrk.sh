import { useContext } from "react";
import type { ReactNode } from "react";
import { OutlineDepth } from "./OutlineDepth";

export function OutlineLabel({
  children,
  sticky = false,
}: {
  children: ReactNode;
  sticky?: boolean;
}) {
  const depth = useContext(OutlineDepth);

  return (
    <div
      data-outline-label
      style={{ paddingLeft: `calc(1rem + ${Math.max(0, depth - 1)} * 2ch)` }}
      className={`flex items-baseline pr-4 before:w-[var(--outline-marker-width)] before:shrink-0 before:text-zinc-400 before:content-[counter(outline-item,var(--outline-style))] ${sticky ? "sticky top-0 z-10 bg-zinc-100" : ""}`}
    >
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
