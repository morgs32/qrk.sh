import type { ReactNode } from "react";

export function OrderedTableOfContentsPreview({ children }: { children: ReactNode }) {
  return <div className="overflow-auto bg-white py-6">{children}</div>;
}
