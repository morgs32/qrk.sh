import type { ReactNode } from "react";

/** A navigation group owns its surface and spacing before full-width content. */
export function OutlineRows({
  children,
  sticky = false,
}: {
  children: ReactNode;
  sticky?: boolean;
}) {
  return (
    <div className={`bg-zinc-100 pb-2 ${sticky ? "sticky top-0 z-10" : ""}`}>
      {children}
    </div>
  );
}
