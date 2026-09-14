import type { ReactNode } from "react";

export function OutlinePreview({ children }: { children: ReactNode }) {
  return <div className="overflow-auto bg-white p-6">{children}</div>;
}
