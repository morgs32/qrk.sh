import type { ReactNode } from "react";

export function OrderedTableOfContentsTitle({ children }: { children: ReactNode }) {
  return <h2 className="m-0 shrink-0 bg-zinc-100 px-4 py-2 text-sm font-normal">{children}</h2>;
}
