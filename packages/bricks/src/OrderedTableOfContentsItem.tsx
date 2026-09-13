import type { ReactNode } from "react";

export function OrderedTableOfContentsItem({
  children,
  spaced = false,
}: {
  children: ReactNode;
  spaced?: boolean;
}) {
  return (
    <li className={`break-words [counter-increment:toc-item] ${spaced ? "flex flex-col gap-2" : ""}`}>
      {children}
    </li>
  );
}
