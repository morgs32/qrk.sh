import type { ReactNode } from "react";

/** Keep content available to screen readers and visually hidden, including on focus. */
export function ScreenReaderOnly(props: { children: ReactNode }) {
  const { children } = props;
  return <span className="sr-only">{children}</span>;
}
