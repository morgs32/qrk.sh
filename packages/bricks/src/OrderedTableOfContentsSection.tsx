import type { ReactNode } from "react";

/** One complete navigation block, separated from surrounding content. */
export function OrderedTableOfContentsSection({ children }: { children: ReactNode }) {
  return <section className="bg-zinc-100 py-2">{children}</section>;
}
