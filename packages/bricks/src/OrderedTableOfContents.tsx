import type { ReactNode } from "react";
import { OrderedTableOfContentsTitle } from "./OrderedTableOfContentsTitle";
import { OrderedTableOfContentsList } from "./OrderedTableOfContentsList";
import { OrderedTableOfContentsLabel } from "./OrderedTableOfContentsLabel";
import { OrderedTableOfContentsItem } from "./OrderedTableOfContentsItem";

/** Composable contents; callers own links and selection controls. */
export function OrderedTableOfContents({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Table of contents"
      className="qrk-bricks flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden font-mono text-sm leading-5 text-zinc-900"
    >
      {children}
    </section>
  );
}

OrderedTableOfContents.Title = OrderedTableOfContentsTitle;
OrderedTableOfContents.List = OrderedTableOfContentsList;
OrderedTableOfContents.Label = OrderedTableOfContentsLabel;
OrderedTableOfContents.Item = OrderedTableOfContentsItem;
