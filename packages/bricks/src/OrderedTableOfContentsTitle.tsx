import type { ReactNode } from "react";

export function OrderedTableOfContentsTitle({ children }: { children: ReactNode }) {
  return <h2 className="m-0 mb-5 text-sm font-normal">{children}</h2>;
}
