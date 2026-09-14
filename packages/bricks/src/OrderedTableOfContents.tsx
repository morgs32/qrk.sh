import type { ReactNode } from "react";
import { OrderedTableOfContentsRows } from "./OrderedTableOfContentsRows";
import { OrderedTableOfContentsPreview } from "./OrderedTableOfContentsPreview";
import { OrderedTableOfContentsTitle } from "./OrderedTableOfContentsTitle";
import { OrderedTableOfContentsList } from "./OrderedTableOfContentsList";
import { OrderedTableOfContentsLabel } from "./OrderedTableOfContentsLabel";
import { OrderedTableOfContentsItem } from "./OrderedTableOfContentsItem";

/**
 * One complete navigation block, separated from surrounding content.
 * Composable contents; callers own links and selection controls.
 */
export function OrderedTableOfContents({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Table of contents" className="bg-white py-3">
      {children}
    </section>
  );
}

OrderedTableOfContents.Title = OrderedTableOfContentsTitle;
OrderedTableOfContents.List = OrderedTableOfContentsList;
OrderedTableOfContents.Label = OrderedTableOfContentsLabel;
OrderedTableOfContents.Item = OrderedTableOfContentsItem;

OrderedTableOfContents.Preview = OrderedTableOfContentsPreview;

OrderedTableOfContents.Rows = OrderedTableOfContentsRows;
