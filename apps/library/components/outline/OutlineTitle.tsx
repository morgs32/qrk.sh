import type { ReactNode } from "react";

export function OutlineTitle({
  children,
  sticky = false,
}: {
  children: ReactNode;
  sticky?: boolean;
}) {
  return (
    <h2
      className={`m-0 shrink-0 bg-zinc-100 px-4 py-4 font-normal ${sticky ? "sticky top-0 z-10" : ""}`}
    >
      {children}
    </h2>
  );
}
