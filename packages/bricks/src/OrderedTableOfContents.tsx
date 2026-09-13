import type { ReactNode } from "react";
import { OrderedTableOfContentsTitle } from "./OrderedTableOfContentsTitle";
import { OrderedTableOfContentsSection } from "./OrderedTableOfContentsSection";
import { OrderedTableOfContentsItem } from "./OrderedTableOfContentsItem";

/** Composable contents; callers own links and selection controls. */
export function OrderedTableOfContents({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Table of contents"
      className="qrk-bricks w-full min-w-0 bg-zinc-100 p-4 font-mono text-sm leading-5 text-zinc-900 [counter-reset:toc-section]"
    >
      {children}
    </section>
  );
}

OrderedTableOfContents.Title = OrderedTableOfContentsTitle;
OrderedTableOfContents.Section = OrderedTableOfContentsSection;
OrderedTableOfContents.Item = OrderedTableOfContentsItem;
