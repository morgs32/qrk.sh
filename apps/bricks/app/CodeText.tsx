import type { ReactNode } from "react";

export function CodeText(props: { children: ReactNode }) {
  return (
    <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs font-medium">
      {props.children}
    </code>
  );
}
