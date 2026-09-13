import type { ReactNode } from "react";

export function OrderedTableOfContentsTitle({ children }: { children: ReactNode }) {
  return <h2 className="m-0 shrink-0 bg-zinc-100 p-4 pb-9 text-sm font-normal">{children}</h2>;
}
