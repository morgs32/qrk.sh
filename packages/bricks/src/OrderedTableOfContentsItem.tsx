import type { ReactNode } from "react";

export function OrderedTableOfContentsItem({ children }: { children: ReactNode }) {
  return (
    <li className="break-words [counter-increment:toc-item] before:mr-[1ch] before:text-zinc-400 before:content-[counter(toc-item,upper-alpha)]">
      {children}
    </li>
  );
}
