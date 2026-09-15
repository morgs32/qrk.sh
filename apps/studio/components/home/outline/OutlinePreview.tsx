import type { ReactNode } from "react";

export function OutlinePreview({ children }: { children: ReactNode }) {
  return <div className="overflow-auto bg-white px-4 py-6">{children}</div>;
}
