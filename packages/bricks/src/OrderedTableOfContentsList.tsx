import { useContext } from "react";
import type { ReactNode } from "react";
import { OrderedTableOfContentsDepth } from "./OrderedTableOfContentsDepth";

export function OrderedTableOfContentsList({
  children,
  scrollable = false,
}: {
  children: ReactNode;
  scrollable?: boolean;
}) {
  const depth = useContext(OrderedTableOfContentsDepth);
  const marker =
    depth === 0
      ? "[--toc-style:decimal] [--toc-marker-width:24px]"
      : depth === 1
        ? "[--toc-style:upper-alpha] [--toc-marker-width:24px]"
        : "[--toc-style:lower-roman] [--toc-marker-width:36px]";

  return (
    <OrderedTableOfContentsDepth value={depth + 1}>
      <ol
        type={depth === 0 ? "1" : depth === 1 ? "A" : "i"}
        className={`list-none p-0 [counter-reset:toc-item] ${marker} m-0 ${scrollable ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : ""}`}
      >
        {children}
      </ol>
    </OrderedTableOfContentsDepth>
  );
}
