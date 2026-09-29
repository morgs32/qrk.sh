import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";

export default function SiteRootLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <SiteHeader />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
