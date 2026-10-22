import type { ReactNode } from "react";

export default function SiteLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
