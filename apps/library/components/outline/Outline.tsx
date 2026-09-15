import type { ReactNode } from "react";
import { OutlineRows } from "./OutlineRows";
import { OutlinePreview } from "./OutlinePreview";
import { OutlineTitle } from "./OutlineTitle";
import { OutlineList } from "./OutlineList";
import { OutlineLabel } from "./OutlineLabel";
import { OutlineItem } from "./OutlineItem";

/**
 * One complete navigation block, separated from surrounding content.
 * Composable contents; callers own links and selection controls.
 */
export function Outline({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Outline" className="py-3">
      {children}
    </section>
  );
}

Outline.Title = OutlineTitle;
Outline.List = OutlineList;
Outline.Label = OutlineLabel;
Outline.Item = OutlineItem;

Outline.Preview = OutlinePreview;

Outline.Rows = OutlineRows;
