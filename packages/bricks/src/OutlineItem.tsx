import type { ReactNode } from "react";

export function OutlineItem({ children }: { children: ReactNode }) {
  return <li className="break-words [counter-increment:outline-item]">{children}</li>;
}
