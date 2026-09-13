import type { ReactNode } from "react";

export function OrderedTableOfContentsItem({ children }: { children: ReactNode }) {
  return (
    <li className="break-words [counter-increment:toc-item] [&>[data-toc-label]:only-child]:py-0 [&:first-child>[data-toc-label]:only-child]:pt-2 [&:last-child>[data-toc-label]:only-child]:pb-2">
      {children}
    </li>
  );
}
