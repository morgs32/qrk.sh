import type { ReactNode } from "react";

export function OrderedTableOfContentsItem({ children }: { children: ReactNode }) {
  return (
    <li className="break-words [&:first-child:not(:has(>[data-toc-label]))]:pt-2 [&:last-child:not(:has(>[data-toc-label]))]:pb-2 [counter-increment:toc-item] before:inline-block before:w-[var(--toc-marker-width)] before:text-zinc-400 before:content-[counter(toc-item,var(--toc-style))] [&:has(>[data-toc-label])]:before:hidden">
      {children}
    </li>
  );
}
