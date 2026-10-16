"use client";

import { ViewTransition, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DrawerHeader } from "./DrawerHeader";

export default function DrawerLayout(props: { children: ReactNode }) {
  const { children } = props;
  const pathname = usePathname();
  return (
    <ViewTransition default="none" exit="drawer-bottom-out">
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        <DrawerHeader key={pathname} />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </ViewTransition>
  );
}
