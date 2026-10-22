"use client";

import type { ReactNode } from "react";
import { DrawerHeader } from "./DrawerHeader";

export default function DrawerLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
      style={{ viewTransitionName: "app-drawer" }}
    >
      <div className="h-14 shrink-0">
        <DrawerHeader />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  );
}
