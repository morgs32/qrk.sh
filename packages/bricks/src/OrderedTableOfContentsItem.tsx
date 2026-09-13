import type { ReactNode } from "react";

export function OrderedTableOfContentsItem({ children }: { children: ReactNode }) {
  return <li className="break-words [counter-increment:toc-item]">{children}</li>;
}
