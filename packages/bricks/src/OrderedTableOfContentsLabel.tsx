import { useContext } from "react";
import type { ReactNode } from "react";
import { OrderedTableOfContentsDepth } from "./OrderedTableOfContentsDepth";

export function OrderedTableOfContentsLabel({
  children,
  sticky = false,
  padding = "normal",
}: {
  children: ReactNode;
  sticky?: boolean;
  padding?: "none" | "normal" | "heading";
}) {
  const depth = useContext(OrderedTableOfContentsDepth);

  return (
    <div
      data-toc-label
      style={{ paddingLeft: `calc(1rem + ${Math.max(0, depth - 1)} * 2ch)` }}
      className={`flex items-baseline pr-4 ${padding === "heading" ? "py-3" : padding === "normal" ? "py-2" : ""} before:w-[var(--toc-marker-width)] before:shrink-0 before:text-zinc-400 before:content-[counter(toc-item,var(--toc-style))] ${sticky ? "sticky top-0 z-10 bg-zinc-100" : ""}`}
    >
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
