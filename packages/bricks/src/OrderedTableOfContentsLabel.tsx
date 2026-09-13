import type { ReactNode } from "react";

export function OrderedTableOfContentsLabel({
  children,
  sticky = false,
}: {
  children: ReactNode;
  sticky?: boolean;
}) {
  return (
    <div
      data-toc-label
      className={`flex items-baseline gap-[1ch] before:shrink-0 before:text-zinc-400 before:content-[counter(toc-item,var(--toc-style))] ${sticky ? "sticky top-0 z-10 bg-zinc-100 p-4" : ""}`}
    >
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
